// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TamaPets
/// @notice One pet per wallet. Feeding burns TAMA and resets the pet's timer. When the timer
///         runs out anyone may declare the pet dead. Living pets share every wei of ETH sent to
///         this contract (the launchpad's creator fee), weighted by stage.
///
///         No owner, no admin, no pause. Every number below is final once deployed.
contract TamaPets is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ constants

    IERC20 public immutable token;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant FEED_COST = 1_000 ether;
    uint8 public constant STAGES = 8;
    /// @notice Share of a dead pet's unclaimed ETH paid to whoever reports the death (bps).
    uint256 public constant REPORTER_BPS = 1_000;
    uint256 private constant ACC_PRECISION = 1e18;

    /// @dev Total TAMA a pet must have burned to reach each stage.
    function stageThreshold(uint8 stage) public pure returns (uint256) {
        if (stage == 0) return 0;
        if (stage == 1) return 10_000 ether;
        if (stage == 2) return 50_000 ether;
        if (stage == 3) return 150_000 ether;
        if (stage == 4) return 400_000 ether;
        if (stage == 5) return 1_000_000 ether;
        if (stage == 6) return 2_500_000 ether;
        return 6_000_000 ether;
    }

    /// @dev Seconds a pet may go without food at each stage.
    function stageTimer(uint8 stage) public pure returns (uint256) {
        if (stage == 0) return 24 hours;
        if (stage == 1) return 20 hours;
        if (stage == 2) return 16 hours;
        if (stage == 3) return 8 hours;
        if (stage == 4) return 6 hours;
        if (stage == 5) return 4 hours;
        if (stage == 6) return 3 hours;
        return 2 hours;
    }

    /// @dev Reward weight doubles per stage: 1, 2, 4 ... 128.
    function stageWeight(uint8 stage) public pure returns (uint256) {
        return uint256(1) << stage;
    }

    function stageFor(uint256 burned) public pure returns (uint8 s) {
        for (s = STAGES - 1; s > 0; s--) {
            if (burned >= stageThreshold(s)) return s;
        }
        return 0;
    }

    // ------------------------------------------------------------------ state

    struct Pet {
        bool alive;
        uint8 stage;
        uint64 bornAt;
        uint64 lastFed;
        uint128 burned;
        uint256 rewardDebt; // accumulator snapshot, MasterChef style
        uint256 owed;       // settled but unclaimed ETH
        uint32 generation;  // how many pets this wallet has had
    }

    mapping(address => Pet) public pets;

    uint256 public totalWeight;
    uint256 public accEthPerWeight;
    /// @notice ETH received while no pet was alive; joins the pool at the next hatch.
    uint256 public unallocated;

    uint256 public livingPets;
    uint256 public totalDeaths;
    uint256 public totalBurned;
    uint256 public totalEthReceived;
    uint256 public totalEthClaimed;

    // ------------------------------------------------------------------ events

    event Hatched(address indexed owner, uint32 generation);
    event Fed(address indexed owner, uint256 burned, uint8 stage, uint64 nextDeadline);
    event StageUp(address indexed owner, uint8 stage);
    event Died(address indexed owner, address indexed reporter, uint8 stage, uint256 ageSeconds, uint256 legacy);
    event Claimed(address indexed owner, uint256 amount);
    event Funded(address indexed from, uint256 amount);

    error AlreadyAlive();
    error NoPet();
    error Expired();
    error NotExpired();
    error NothingToClaim();

    constructor(IERC20 token_) {
        token = token_;
    }

    // ------------------------------------------------------------------ ETH in

    receive() external payable {
        _distribute(msg.value);
        totalEthReceived += msg.value;
        emit Funded(msg.sender, msg.value);
    }

    function _distribute(uint256 amount) internal {
        if (amount == 0) return;
        if (totalWeight == 0) {
            unallocated += amount;
        } else {
            accEthPerWeight += (amount * ACC_PRECISION) / totalWeight;
        }
    }

    // ------------------------------------------------------------------ views

    function deadline(address owner) public view returns (uint256) {
        Pet storage p = pets[owner];
        return uint256(p.lastFed) + stageTimer(p.stage);
    }

    function isExpired(address owner) public view returns (bool) {
        Pet storage p = pets[owner];
        return p.alive && block.timestamp > deadline(owner);
    }

    /// @notice ETH the pet could claim right now (0 once it has expired).
    function pending(address owner) public view returns (uint256) {
        Pet storage p = pets[owner];
        if (!p.alive) return 0;
        uint256 w = stageWeight(p.stage);
        return p.owed + (w * accEthPerWeight) / ACC_PRECISION - p.rewardDebt;
    }

    // ------------------------------------------------------------------ actions

    /// @notice Start a new pet. Costs one feeding. If this wallet's previous pet has expired
    ///         but nobody reported it, it is buried first (no reporter reward).
    function hatch() external nonReentrant {
        Pet storage p = pets[msg.sender];
        if (p.alive) {
            if (block.timestamp <= deadline(msg.sender)) revert AlreadyAlive();
            _bury(msg.sender, address(0));
        }

        _burn(msg.sender, FEED_COST);

        uint32 gen = p.generation + 1;
        p.alive = true;
        p.stage = 0;
        p.bornAt = uint64(block.timestamp);
        p.lastFed = uint64(block.timestamp);
        p.burned = uint128(FEED_COST);
        p.owed = 0;
        p.generation = gen;

        // pool any ETH that arrived while nobody was alive
        uint256 w = stageWeight(0);
        totalWeight += w;
        livingPets += 1;
        // snapshot first, so ETH that waited for the first pet counts for it
        p.rewardDebt = (w * accEthPerWeight) / ACC_PRECISION;
        if (unallocated > 0) {
            uint256 u = unallocated;
            unallocated = 0;
            accEthPerWeight += (u * ACC_PRECISION) / totalWeight;
        }

        emit Hatched(msg.sender, gen);
        emit Fed(msg.sender, FEED_COST, 0, uint64(deadline(msg.sender)));
    }

    /// @notice Burn FEED_COST TAMA, reset the timer, maybe level up.
    function feed() external nonReentrant {
        Pet storage p = pets[msg.sender];
        if (!p.alive) revert NoPet();
        if (block.timestamp > deadline(msg.sender)) revert Expired();

        _settle(p);
        _burn(msg.sender, FEED_COST);

        p.burned += uint128(FEED_COST);
        p.lastFed = uint64(block.timestamp);

        uint8 newStage = stageFor(p.burned);
        if (newStage != p.stage) {
            totalWeight = totalWeight - stageWeight(p.stage) + stageWeight(newStage);
            p.stage = newStage;
            emit StageUp(msg.sender, newStage);
        }
        p.rewardDebt = (stageWeight(p.stage) * accEthPerWeight) / ACC_PRECISION;

        emit Fed(msg.sender, FEED_COST, p.stage, uint64(deadline(msg.sender)));
    }

    /// @notice Report an expired pet. Reporter gets 10 % of its unclaimed ETH, the rest goes to
    ///         the living pets.
    function kill(address owner) external nonReentrant {
        Pet storage p = pets[owner];
        if (!p.alive) revert NoPet();
        if (block.timestamp <= deadline(owner)) revert NotExpired();
        _bury(owner, msg.sender);
    }

    /// @notice Withdraw the ETH your living pet has earned.
    function claim() external nonReentrant {
        Pet storage p = pets[msg.sender];
        if (!p.alive) revert NoPet();
        if (block.timestamp > deadline(msg.sender)) revert Expired();

        _settle(p);
        uint256 amount = p.owed;
        if (amount == 0) revert NothingToClaim();
        p.owed = 0;
        totalEthClaimed += amount;
        _pay(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ------------------------------------------------------------------ internals

    function _burn(address from, uint256 amount) internal {
        token.safeTransferFrom(from, DEAD, amount);
        totalBurned += amount;
    }

    function _settle(Pet storage p) internal {
        uint256 w = stageWeight(p.stage);
        uint256 accrued = (w * accEthPerWeight) / ACC_PRECISION;
        p.owed += accrued - p.rewardDebt;
        p.rewardDebt = accrued;
    }

    function _bury(address owner, address reporter) internal {
        Pet storage p = pets[owner];
        _settle(p);

        uint256 legacy = p.owed;
        uint8 stage = p.stage;
        uint256 age = block.timestamp - p.bornAt;
        uint256 w = stageWeight(stage);

        p.alive = false;
        p.owed = 0;
        p.rewardDebt = 0;
        totalWeight -= w;
        livingPets -= 1;
        totalDeaths += 1;

        uint256 tip = reporter == address(0) ? 0 : (legacy * REPORTER_BPS) / 10_000;
        _distribute(legacy - tip);
        if (tip > 0) {
            totalEthClaimed += tip;
            _pay(reporter, tip);
        }

        emit Died(owner, reporter, stage, age, legacy);
    }

    function _pay(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "eth transfer failed");
    }
}
