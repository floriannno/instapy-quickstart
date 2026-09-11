// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBuybackExecutor} from "../interfaces/IBuybackExecutor.sol";

/// @dev Test double: pays out `rate` tokens per wei from its own balance.
contract MockExecutor is IBuybackExecutor {
    uint256 public rate;
    bool public shouldFail;

    constructor(uint256 rate_) {
        rate = rate_;
    }

    function setFail(bool v) external {
        shouldFail = v;
    }

    function buy(address token, uint256 minOut, address recipient)
        external
        payable
        override
        returns (uint256 amountOut)
    {
        require(!shouldFail, "mock: fail");
        amountOut = msg.value * rate;
        require(amountOut >= minOut, "mock: slippage");
        IERC20(token).transfer(recipient, amountOut);
    }
}
