// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Idols100x} from "../src/idols100x.sol";

/// @notice Set named on-chain fields for already-minted tokens 1–4.
/// Env: `IDOLS100X_ADDRESS`, `PAYMASTER_SIGNER` (same as `GROKBOT_WEB3_WALLET`). Monad testnet only.
contract SetIdolMetadata is Script {
    using stdJson for string;

    uint256 constant DEFAULT_PRICE = 1_000_000;

    function run() external {
        if (block.chainid != 10143) {
            revert("Idols100x: Monad testnet (10143) only");
        }
        address nftAddr = vm.envOr(
            "IDOLS100X_ADDRESS",
            address(0xeB88B15911431c4F3903F5780AB584E7CD6022cB)
        );
        Idols100x nft = Idols100x(nftAddr);

        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        address caller = vm.addr(pk);
        vm.startBroadcast(pk);

        for (uint256 tokenId = 1; tokenId <= 4; tokenId++) {
            try nft.ownerOf(tokenId) returns (address tokenOwner) {
                if (tokenOwner != caller) {
                    console2.log("skip not owner", tokenId);
                    continue;
                }
                string memory path = string.concat("metadata/", vm.toString(tokenId), ".json");
                string memory json = vm.readFile(string.concat(vm.projectRoot(), "/", path));
                string memory scenes = vm.readFile(
                    string.concat(vm.projectRoot(), "/metadata/", vm.toString(tokenId), ".scenes.json")
                );
                nft.setIdolContent(
                    tokenId,
                    Idols100x.IdolContentWrite({
                        name: json.readString(".name"),
                        bio: json.readString(".bio"),
                        personality: json.readString(".personality"),
                        look: json.readString(".look"),
                        voice: json.readString(".voice"),
                        website: json.readString(".website"),
                        twitter: json.readString(".twitter"),
                        scenes: scenes
                    })
                );
                nft.setWelcome(tokenId, json.readString(".welcome"));
                nft.setIdolPricing(
                    tokenId,
                    Idols100x.IdolPricingWrite({
                        subscribePriceUsdc: DEFAULT_PRICE,
                        imageUnlockPriceUsdc: DEFAULT_PRICE
                    })
                );
                console2.log("set fields", tokenId);
            } catch {
                console2.log("skip unminted", tokenId);
            }
        }

        vm.stopBroadcast();
        console2.log("Idols100x", nftAddr);
    }
}
