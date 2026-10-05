// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/Script.sol";
import {Idols100x} from "../src/idols100x.sol";
import {LonelyUSD} from "../src/LonelyUSD.sol";
import {MintDefaultIdols} from "./MintDefaultIdols.sol";

/// @notice Mint one idol to the deployer via `mint()` (20 LUSD). If token id is 1–4, write metadata and list.
/// Env: IDOLS100X_ADDRESS, PAYMASTER_SIGNER (Grokbot). Does not touch other collections.
contract MintOneIdol is MintDefaultIdols {
    function run() external {
        if (block.chainid != 10143) {
            revert("Idols100x: Monad testnet (10143) only");
        }
        address nftAddr = vm.envAddress("IDOLS100X_ADDRESS");
        Idols100x nft = Idols100x(nftAddr);
        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        address deployer = vm.addr(pk);
        uint256 tokenId = nft.nextTokenId();
        require(tokenId >= 1 && tokenId <= nft.MAX_SUPPLY(), "sold out");
        require(nft.mintsOf(deployer) < nft.MAX_MINTS_PER_ACCOUNT(), "mint cap");

        vm.startBroadcast(pk);
        fundMintApprove(LonelyUSD(address(nft.usdc())), nftAddr, deployer, 1);
        uint256 minted = nft.mint();
        require(minted == tokenId, "token id mismatch");
        if (tokenId <= 4) {
            writeDefaultFields(nft, tokenId);
        }
        address tokenOwner = nft.ownerOf(tokenId);
        require(tokenOwner == deployer, "mint to deployer");
        require(tokenOwner != address(nft), "not contract");
        require(tokenOwner != CUSTODIAN_E541, "not 0xe541");
        vm.stopBroadcast();

        console2.log("tokenId", tokenId);
        console2.log("nftOwner", nft.ownerOf(tokenId));
        console2.log("salePrice", nft.salePriceUsdcOf(tokenId));
        console2.log("tba", nft.tokenBoundAccount(tokenId));
        console2.log("name", nft.idolOf(tokenId).name);
        console2.log("mintsOf", nft.mintsOf(deployer));
    }
}
