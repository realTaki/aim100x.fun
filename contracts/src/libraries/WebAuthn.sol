// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base64URL} from "./Base64URL.sol";

/// @notice WebAuthn assertion check. P-256 via Monad EIP-7951 at 0x0100.
/// Same address and 160-byte interface as RIP-7212. Valid → 32-byte `1`; invalid → empty.
library WebAuthn {
    address internal constant P256_VERIFY = address(0x0100);

    struct Auth {
        bytes authenticatorData;
        string clientDataJSON;
        uint256 challengeIndex;
        uint256 typeIndex;
        uint256 r;
        uint256 s;
    }

    bytes1 private constant UP = 0x01;
    bytes1 private constant UV = 0x04;
    uint256 private constant P256_N =
        0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    uint256 private constant P256_N_DIV_2 = P256_N / 2;

    function verify(bytes memory challenge, Auth memory auth, uint256 x, uint256 y)
        internal
        view
        returns (bool)
    {
        if (auth.s == 0 || auth.s > P256_N_DIV_2 || auth.r == 0 || auth.r >= P256_N) {
            return false;
        }
        if (auth.authenticatorData.length < 37) return false;
        if (auth.authenticatorData[32] & UP != UP) return false;
        if (auth.authenticatorData[32] & UV != UV) return false;
        if (!_bytesEq(auth.clientDataJSON, auth.typeIndex, bytes('"type":"webauthn.get"'))) {
            return false;
        }
        bytes memory expected =
            abi.encodePacked('"challenge":"', Base64URL.encode(challenge), '"');
        if (!_bytesEq(auth.clientDataJSON, auth.challengeIndex, expected)) {
            return false;
        }
        bytes32 messageHash =
            sha256(abi.encodePacked(auth.authenticatorData, sha256(bytes(auth.clientDataJSON))));
        return verifyP256(messageHash, auth.r, auth.s, x, y);
    }

    function verifyP256(bytes32 hash, uint256 r, uint256 s, uint256 x, uint256 y)
        internal
        view
        returns (bool)
    {
        bytes memory args = abi.encode(hash, r, s, x, y);
        (bool ok, bytes memory ret) = P256_VERIFY.staticcall(args);
        return ok && ret.length == 32 && abi.decode(ret, (uint256)) == 1;
    }

    function _bytesEq(string memory json, uint256 start, bytes memory expected)
        private
        pure
        returns (bool)
    {
        bytes memory raw = bytes(json);
        uint256 len = expected.length;
        if (start + len > raw.length) return false;
        for (uint256 i; i < len; ++i) {
            if (raw[start + i] != expected[i]) return false;
        }
        return true;
    }
}
