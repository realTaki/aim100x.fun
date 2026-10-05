// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAccount, IEntryPoint, UserOperation} from "./UserOperation.sol";
import {WebAuthn} from "./libraries/WebAuthn.sol";

/// @notice ERC-4337 v0.6 account. Signer is a WebAuthn P-256 passkey (not secp256k1).
contract PasskeyAccount is IAccount {
    uint256 private constant SIG_VALIDATION_FAILED = 1;

    IEntryPoint public immutable entryPoint;
    /// @dev Stored for CREATE2 compatibility with the live factory. Verification uses 0x0100.
    address public immutable p256Verifier;
    uint256 public immutable pubkeyX;
    uint256 public immutable pubkeyY;

    error NotEntryPoint();
    error CallFailed();

    constructor(IEntryPoint entryPoint_, address p256Verifier_, uint256 pubkeyX_, uint256 pubkeyY_) {
        entryPoint = entryPoint_;
        p256Verifier = p256Verifier_;
        pubkeyX = pubkeyX_;
        pubkeyY = pubkeyY_;
    }

    receive() external payable {}

    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
        if (!_isValidSignature(userOpHash, userOp.signature)) {
            return SIG_VALIDATION_FAILED;
        }
        if (missingAccountFunds != 0) {
            (bool ok,) = payable(msg.sender).call{value: missingAccountFunds}("");
            ok;
        }
        return 0;
    }

    function execute(address dest, uint256 value, bytes calldata data) external {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
        _call(dest, value, data);
    }

    function executeBatch(address[] calldata dest, uint256[] calldata values, bytes[] calldata data)
        external
    {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
        uint256 n = dest.length;
        require(n == values.length && n == data.length, "len");
        for (uint256 i; i < n; ++i) {
            _call(dest[i], values[i], data[i]);
        }
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (_isValidSignature(hash, signature)) {
            return 0x1626ba7e;
        }
        return 0xffffffff;
    }

    function _isValidSignature(bytes32 hash, bytes calldata signature) internal view returns (bool) {
        WebAuthn.Auth memory auth = abi.decode(signature, (WebAuthn.Auth));
        return WebAuthn.verify(abi.encodePacked(hash), auth, pubkeyX, pubkeyY);
    }

    function _call(address dest, uint256 value, bytes memory data) internal {
        (bool ok, bytes memory ret) = dest.call{value: value}(data);
        if (!ok) {
            if (ret.length > 0) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
            revert CallFailed();
        }
    }
}
