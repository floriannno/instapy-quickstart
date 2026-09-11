// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICosmicCoin {
    function launch(uint256 eventId) external;
    function tradingEnabled() external view returns (bool);
    function burn(uint256 value) external;
    function balanceOf(address account) external view returns (uint256);
}

interface ICosmicVault {
    function onDetection(uint256 eventId, uint256 minTokensOut) external;
}
