// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {Idols100x} from "../src/idols100x.sol";
import {LonelyUSD} from "../src/LonelyUSD.sol";

/// @notice Shared mint+configure for tokens 1–4 from the deployer wallet.
///         Mints to the caller via `mint()`, never `address(this)` or `0xe541`.
abstract contract MintDefaultIdols is Script {
    using stdJson for string;

    address internal constant CUSTODIAN_E541 = 0xE541Ba52E2Eff4fEc12441C77F73352d885e183A;
    uint256 internal constant DEFAULT_SUBSCRIBE_PRICE = 1_000_000;
    uint256 internal constant SALE_20_LUSD = 20_000_000;

    function fundMintApprove(LonelyUSD lusd, address nft, address minter, uint256 count) internal {
        uint256 need = SALE_20_LUSD * count;
        uint256 bal = lusd.balanceOf(minter);
        if (bal < need) {
            lusd.mint(minter, need - bal);
        }
        lusd.approve(nft, need);
    }

    function writeDefaultFields(Idols100x nft, uint256 tokenId) internal {
        string memory json = vm.readFile(
            string.concat(vm.projectRoot(), "/metadata/", vm.toString(tokenId), ".json")
        );
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
                subscribePriceUsdc: DEFAULT_SUBSCRIBE_PRICE,
                imageUnlockPriceUsdc: DEFAULT_SUBSCRIBE_PRICE
            })
        );
        nft.setPublic(tokenId, true);
        nft.setSalePrice(tokenId, SALE_20_LUSD);
    }

    function mintConfigureDefaults(Idols100x nft, LonelyUSD lusd, address minter) internal {
        require(nft.MAX_SUPPLY() == 100, "supply cap 100");
        require(nft.MAX_MINTS_PER_ACCOUNT() == 4, "4 mints per account");
        require(nft.MINT_PRICE_USDC_ATOMIC() == SALE_20_LUSD, "mint 20 LUSD");
        fundMintApprove(lusd, address(nft), minter, 4);
        for (uint256 tokenId = 1; tokenId <= 4; tokenId++) {
            uint256 minted = nft.mint();
            require(minted == tokenId, "token id mismatch");
            writeDefaultFields(nft, tokenId);
            address tokenOwner = nft.ownerOf(tokenId);
            require(tokenOwner == minter, "defaults mint to deployer");
            require(tokenOwner != address(nft), "not contract");
            require(tokenOwner != CUSTODIAN_E541, "not 0xe541");
            require(nft.salePriceUsdcOf(tokenId) == SALE_20_LUSD, "sale 20 LUSD");
            require(nft.publicOf(tokenId), "public");
            require(nft.mintsOf(minter) == tokenId, "mint count");
        }
        require(nft.nextTokenId() == 5, "supply after defaults");
    }
}
