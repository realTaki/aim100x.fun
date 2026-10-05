// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEntryPoint} from "./UserOperation.sol";
import {PasskeyAccount} from "./PasskeyAccount.sol";

/// @notice CREATE2 factory. Salt is keccak256(pubkeyX || pubkeyY) from the passkey.
contract PasskeyAccountFactory {
    IEntryPoint public immutable entryPoint;
    /// @dev Baked into PasskeyAccount CREATE2. Pass `address(0x0100)` on new deploys.
    /// Do not replace the live Monad factory — that would rotate every passkey wallet.
    address public immutable p256Verifier;

    mapping(address => bool) public isAccount;
    mapping(bytes32 => address) public accountOfCredential;

    event AccountCreated(address indexed account, uint256 pubkeyX, uint256 pubkeyY, bytes credentialId);

    constructor(IEntryPoint entryPoint_, address p256Verifier_) {
        entryPoint = entryPoint_;
        p256Verifier = p256Verifier_;
    }

    function saltOf(uint256 pubkeyX, uint256 pubkeyY) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(pubkeyX, pubkeyY));
    }

    function getAddress(uint256 pubkeyX, uint256 pubkeyY) public view returns (address) {
        bytes32 salt = saltOf(pubkeyX, pubkeyY);
        bytes memory bytecode = abi.encodePacked(
            type(PasskeyAccount).creationCode,
            abi.encode(entryPoint, p256Verifier, pubkeyX, pubkeyY)
        );
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode)))
                )
            )
        );
    }

    function createAccount(uint256 pubkeyX, uint256 pubkeyY, bytes calldata credentialId)
        external
        returns (PasskeyAccount account)
    {
        address addr = getAddress(pubkeyX, pubkeyY);
        if (addr.code.length == 0) {
            account = new PasskeyAccount{salt: saltOf(pubkeyX, pubkeyY)}(
                entryPoint, p256Verifier, pubkeyX, pubkeyY
            );
            isAccount[addr] = true;
        } else {
            account = PasskeyAccount(payable(addr));
            if (!isAccount[addr]) isAccount[addr] = true;
        }
        if (credentialId.length != 0) {
            bytes32 key = keccak256(credentialId);
            address existing = accountOfCredential[key];
            require(existing == address(0) || existing == addr, "cred");
            accountOfCredential[key] = addr;
        }
        emit AccountCreated(addr, pubkeyX, pubkeyY, credentialId);
    }
}
