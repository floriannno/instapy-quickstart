// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title CosmicCoin
/// @notice Fixed-supply ERC-20 whose trading is switched on by the first cosmic-ray
///         detection accepted by the MuonOracle. No mint, no tax, no blacklist, no owner.
///
///         Supply split (immutable, minted once in the constructor):
///           80 %  liquidity   -> launch wallet, to seed the public pool
///           10 %  team        -> VestingWallet (linear, 12 months)
///           10 %  detectors   -> VestingWallet (linear, 12 months), rewards for people
///                                who run a detector for the network later on
contract CosmicCoin is ERC20, ERC20Burnable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant LIQUIDITY_BPS = 8_000;
    uint256 public constant TEAM_BPS = 1_000;
    uint256 public constant DETECTOR_BPS = 1_000;

    /// @notice Contract allowed to call launch(). Set once, never changes.
    address public immutable oracle;
    /// @notice Wallet that may move tokens before launch (to seed the pool and vesting).
    address public immutable launcher;
    /// @notice After this timestamp the launcher may open trading without the oracle.
    ///         Safety valve only, in case the detector hardware dies before the first hit.
    uint256 public immutable emergencyLaunchAfter;

    bool public tradingEnabled;
    uint256 public launchedAt;
    uint256 public launchEventId;

    event Launched(uint256 indexed eventId, uint256 timestamp, bool emergency);

    error TradingNotEnabled();
    error AlreadyLaunched();
    error NotOracle();
    error NotLauncher();
    error TooEarly();
    error ZeroAddress();

    constructor(
        address oracle_,
        address teamVesting,
        address detectorVesting,
        uint256 emergencyDelay
    ) ERC20("CosmicCoin", "MUON") {
        if (oracle_ == address(0) || teamVesting == address(0) || detectorVesting == address(0)) {
            revert ZeroAddress();
        }
        oracle = oracle_;
        launcher = msg.sender;
        emergencyLaunchAfter = block.timestamp + emergencyDelay;

        _mint(msg.sender, (TOTAL_SUPPLY * LIQUIDITY_BPS) / 10_000);
        _mint(teamVesting, (TOTAL_SUPPLY * TEAM_BPS) / 10_000);
        _mint(detectorVesting, (TOTAL_SUPPLY * DETECTOR_BPS) / 10_000);
    }

    /// @notice Called by the oracle on the first accepted muon detection.
    function launch(uint256 eventId) external {
        if (msg.sender != oracle) revert NotOracle();
        _launch(eventId, false);
    }

    /// @notice Safety valve, only usable long after deployment if the oracle never fired.
    function emergencyLaunch() external {
        if (msg.sender != launcher) revert NotLauncher();
        if (block.timestamp < emergencyLaunchAfter) revert TooEarly();
        _launch(0, true);
    }

    function _launch(uint256 eventId, bool emergency) internal {
        if (tradingEnabled) revert AlreadyLaunched();
        tradingEnabled = true;
        launchedAt = block.timestamp;
        launchEventId = eventId;
        emit Launched(eventId, block.timestamp, emergency);
    }

    /// @dev Before launch only the launcher may send tokens (pool seeding, vesting top-ups).
    ///      Burns (to == 0) are always allowed. Mints only happen in the constructor.
    function _update(address from, address to, uint256 value) internal override {
        if (!tradingEnabled && from != address(0) && to != address(0) && from != launcher) {
            revert TradingNotEnabled();
        }
        super._update(from, to, value);
    }
}
