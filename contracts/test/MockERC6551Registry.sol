// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC6551Registry} from "../src/interfaces/IERC6551Registry.sol";

contract MockTokenboundAccount {
    address public implementation;

    function initialize(address implementation_) external {
        implementation = implementation_;
    }
}

contract MockERC6551Registry is IERC6551Registry {
    mapping(bytes32 id => address account) internal _accounts;

    function _id(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(implementation, salt, chainId, tokenContract, tokenId));
    }

    function account(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) public view returns (address) {
        address existing = _accounts[_id(implementation, salt, chainId, tokenContract, tokenId)];
        if (existing != address(0)) return existing;
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(implementation, salt, chainId, tokenContract, tokenId)
                    )
                )
            )
        );
    }

    function createAccount(
        address implementation,
        bytes32 salt,
        uint256 chainId,
        address tokenContract,
        uint256 tokenId
    ) external returns (address) {
        bytes32 id = _id(implementation, salt, chainId, tokenContract, tokenId);
        address existing = _accounts[id];
        if (existing != address(0)) return existing;
        MockTokenboundAccount tba = new MockTokenboundAccount();
        _accounts[id] = address(tba);
        return address(tba);
    }
}
