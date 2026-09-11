// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBuybackExecutor} from "./interfaces/IBuybackExecutor.sol";
import {ICosmicCoin} from "./interfaces/ICosmicHooks.sol";

/// @title CosmicVault
/// @notice Holds ETH (launchpad creator rewards, donations) and, on every accepted muon
///         detection, spends a capped slice of it buying MUON on a DEX and burning it.
///         The vault has no withdraw function for ETH. Once it is in here, the only way
///         out is through a buyback triggered by a particle.
contract CosmicVault is Ownable2Step, ReentrancyGuard {
    ICosmicCoin public immutable token;
    address public immutable oracle;

    IBuybackExecutor public executor;
    /// @notice Share of the current ETH balance spent per detection, in basis points.
    uint256 public spendBps;
    /// @notice Hard cap in wei per detection.
    uint256 public maxSpendPerEvent;

    uint256 public totalEthSpent;
    uint256 public totalTokensBurned;

    event ExecutorSet(address executor);
    event LimitsSet(uint256 spendBps, uint256 maxSpendPerEvent);
    event Buyback(uint256 indexed eventId, uint256 ethSpent, uint256 tokensBurned);
    event BuybackSkipped(uint256 indexed eventId, string reason);
    event Funded(address indexed from, uint256 amount);

    error NotOracle();
    error BpsTooHigh();

    constructor(address owner_, address token_, address oracle_, uint256 spendBps_, uint256 maxSpendPerEvent_)
        Ownable(owner_)
    {
        token = ICosmicCoin(token_);
        oracle = oracle_;
        _setLimits(spendBps_, maxSpendPerEvent_);
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function setExecutor(IBuybackExecutor executor_) external onlyOwner {
        executor = executor_;
        emit ExecutorSet(address(executor_));
    }

    function setLimits(uint256 spendBps_, uint256 maxSpendPerEvent_) external onlyOwner {
        _setLimits(spendBps_, maxSpendPerEvent_);
    }

    function _setLimits(uint256 spendBps_, uint256 maxSpendPerEvent_) internal {
        if (spendBps_ > 10_000) revert BpsTooHigh();
        spendBps = spendBps_;
        maxSpendPerEvent = maxSpendPerEvent_;
        emit LimitsSet(spendBps_, maxSpendPerEvent_);
    }

    /// @notice How much ETH the next detection would spend.
    function nextSpend() public view returns (uint256 amount) {
        amount = (address(this).balance * spendBps) / 10_000;
        if (amount > maxSpendPerEvent) amount = maxSpendPerEvent;
    }

    /// @notice Called by the oracle. Never reverts on a swap problem so that the detection
    ///         itself is still recorded on-chain; a skipped buyback is emitted instead.
    function onDetection(uint256 eventId, uint256 minTokensOut) external nonReentrant {
        if (msg.sender != oracle) revert NotOracle();

        uint256 amount = nextSpend();
        if (amount == 0) {
            emit BuybackSkipped(eventId, "empty");
            return;
        }
        if (address(executor) == address(0)) {
            emit BuybackSkipped(eventId, "no executor");
            return;
        }

        try executor.buy{value: amount}(address(token), minTokensOut, address(this)) returns (uint256 bought) {
            uint256 held = token.balanceOf(address(this));
            uint256 toBurn = bought < held ? bought : held;
            if (toBurn > 0) token.burn(toBurn);
            totalEthSpent += amount;
            totalTokensBurned += toBurn;
            emit Buyback(eventId, amount, toBurn);
        } catch {
            emit BuybackSkipped(eventId, "swap failed");
        }
    }
}
