// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Testnet stand-in for the Pons-created TAMA token. Anyone can mint. Never deploy on mainnet.
contract MockTAMA is ERC20 {
    constructor() ERC20("Test Tamagotchi Coin", "tTAMA") {
        _mint(msg.sender, 1_000_000_000 ether);
    }

    function faucet() external {
        _mint(msg.sender, 100_000 ether);
    }
}
