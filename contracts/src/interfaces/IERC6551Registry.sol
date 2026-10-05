// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Canonical ERC-6551 registry (Tokenbound v3 / EIP-6551).
/// Address: 0x000000006551c19487814612e58FE06813775758
interface IERC6551Registry {
    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address);

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external view returns (address);
}
