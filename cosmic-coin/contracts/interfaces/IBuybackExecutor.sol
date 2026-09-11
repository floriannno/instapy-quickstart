// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable swap adapter. The vault sends ETH, the adapter buys `token`
///         on some DEX and delivers the tokens to `recipient`.
interface IBuybackExecutor {
    function buy(address token, uint256 minOut, address recipient)
        external
        payable
        returns (uint256 amountOut);
}
