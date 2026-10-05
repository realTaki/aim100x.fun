// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Idols100x} from "../src/idols100x.sol";
import {IEntryPoint} from "../src/UserOperation.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {PasskeyPaymaster} from "../src/PasskeyPaymaster.sol";
import {LonelyUSD} from "../src/LonelyUSD.sol";
import {MintDefaultIdols} from "./MintDefaultIdols.sol";

/// @notice Deploy passkey ERC-4337 stack + Idols100x on Monad testnet 10143.
/// Deployer `mint()`s tokens 1–4 to itself, then writes content/pricing + lists at 20 LUSD.
/// Never mints to the collection contract or 0xe541. Never moves prior-collection tokens.
/// P-256 is Monad EIP-7951 at 0x0100 — do not deploy a Solidity verifier.
/// Live factory 0xCEf2… already staticcalls 0x0100; broadcasting a new factory
/// would change CREATE2 and rotate every passkey wallet. Greenfield only.
/// Key: `PAYMASTER_SIGNER` (same as `GROKBOT_WEB3_WALLET`) — never commit / never log.
contract DeployIdols100x is MintDefaultIdols {
    address constant DEFAULT_MINTER = 0xa445BaC003026F5aDf51760CA850ad66750e90ad;
    address constant DEFAULT_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    /// @dev Tokenbound v3 Account Proxy — registry createAccount implementation argument.
    address constant DEFAULT_ACCOUNT_IMPL = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;
    IEntryPoint constant ENTRY_POINT = IEntryPoint(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789);
    address constant P256_VERIFY = address(0x0100);

    function run() external {
        if (block.chainid != 10143) {
            revert("Idols100x: deploy only on Monad testnet (chainId 10143)");
        }

        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        address deployer = vm.addr(pk);
        address initialOwner = vm.envOr("IDOLS100X_OWNER", DEFAULT_MINTER);
        address registry = vm.envOr("IDOLS100X_REGISTRY", DEFAULT_REGISTRY);
        address accountImpl = vm.envOr("IDOLS100X_ACCOUNT_IMPL", DEFAULT_ACCOUNT_IMPL);
        address usdc = vm.envOr("IDOLS100X_USDC", 0x2Ae96dD73d5Cf8f431f2d6e0cf893Db4D64262E8);
        string memory baseURI =
            vm.envOr("IDOLS100X_BASE_URI", string("https://lonelyfuns.vercel.app/api/metadata/"));

        vm.startBroadcast(pk);

        PasskeyAccountFactory walletFactory = new PasskeyAccountFactory(ENTRY_POINT, P256_VERIFY);
        PasskeyPaymaster paymaster = new PasskeyPaymaster(ENTRY_POINT, walletFactory);
        paymaster.deposit{value: 1 ether}();
        paymaster.addStake{value: 0.5 ether}(86_400);

        Idols100x nft = new Idols100x(initialOwner, baseURI, registry, accountImpl, usdc);
        mintConfigureDefaults(nft, LonelyUSD(usdc), deployer);

        vm.stopBroadcast();

        console2.log("Idols100x", address(nft));
        console2.log("P256Verify", P256_VERIFY);
        console2.log("PasskeyAccountFactory", address(walletFactory));
        console2.log("PasskeyPaymaster", address(paymaster));
        console2.log("EntryPoint", address(ENTRY_POINT));
        console2.log("registry", registry);
        console2.log("accountImpl", accountImpl);
        console2.log("usdc", usdc);
        console2.log("owner", nft.owner());
        console2.log("deployer", deployer);
        for (uint256 tokenId = 1; tokenId <= 4; tokenId++) {
            console2.log("tokenId", tokenId);
            console2.log("nftOwner", nft.ownerOf(tokenId));
            console2.log("salePrice", nft.salePriceUsdcOf(tokenId));
            console2.log("tba", nft.tokenBoundAccount(tokenId));
            console2.log("name", nft.idolOf(tokenId).name);
        }
        console2.log("explorer", "https://testnet.monadvision.com");
    }
}
