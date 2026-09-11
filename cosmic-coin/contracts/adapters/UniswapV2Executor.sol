// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBuybackExecutor} from "../interfaces/IBuybackExecutor.sol";

interface IUniswapV2Router {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

/// @notice Buys `token` with ETH through a Uniswap-V2-style router (WETH -> token).
contract UniswapV2Executor is IBuybackExecutor {
    IUniswapV2Router public immutable router;
    address public immutable weth;

    constructor(address router_, address weth_) {
        router = IUniswapV2Router(router_);
        weth = weth_;
    }

    function buy(address token, uint256 minOut, address recipient)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = token;
        uint256 before = IERC20(token).balanceOf(recipient);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            minOut, path, recipient, block.timestamp
        );
        amountOut = IERC20(token).balanceOf(recipient) - before;
    }
}
