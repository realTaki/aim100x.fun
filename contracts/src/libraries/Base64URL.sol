// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Base64URL without padding (WebAuthn challenge encoding).
library Base64URL {
    bytes private constant TABLE =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    function encode(bytes memory data) internal pure returns (string memory) {
        uint256 len = data.length;
        if (len == 0) return "";
        uint256 pad = len % 3;
        uint256 encodedLen = 4 * ((len + 2) / 3);
        if (pad == 1) encodedLen -= 2;
        else if (pad == 2) encodedLen -= 1;

        bytes memory out = new bytes(encodedLen);
        bytes memory table = TABLE;
        uint256 i;
        uint256 j;
        while (i + 3 <= len) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8)
                | uint256(uint8(data[i + 2]));
            out[j] = table[(n >> 18) & 63];
            out[j + 1] = table[(n >> 12) & 63];
            out[j + 2] = table[(n >> 6) & 63];
            out[j + 3] = table[n & 63];
            i += 3;
            j += 4;
        }
        if (pad == 2) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8);
            out[j] = table[(n >> 18) & 63];
            out[j + 1] = table[(n >> 12) & 63];
            out[j + 2] = table[(n >> 6) & 63];
        } else if (pad == 1) {
            uint256 n = uint256(uint8(data[i])) << 16;
            out[j] = table[(n >> 18) & 63];
            out[j + 1] = table[(n >> 12) & 63];
        }
        return string(out);
    }
}
