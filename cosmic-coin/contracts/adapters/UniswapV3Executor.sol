// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBuybackExecutor} from "../interfaces/IBuybackExecutor.sol";

/// @dev SwapRouter02 interface (no deadline inside the struct).
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

/// @notice Buys `token` with native ETH through a Uniswap V3 SwapRouter02 (WETH -> token).
contract UniswapV3Executor is IBuybackExecutor {
    ISwapRouter02 public immutable router;
    address public immutable weth;
    uint24 public immutable poolFee;

    constructor(address router_, address weth_, uint24 poolFee_) {
        router = ISwapRouter02(router_);
        weth = weth_;
        poolFee = poolFee_;
    }

    function buy(address token, uint256 minOut, address recipient)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        amountOut = router.exactInputSingle{value: msg.value}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: token,
                fee: poolFee,
                recipient: recipient,
                amountIn: msg.value,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
    }
}
