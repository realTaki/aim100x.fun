// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {Idols100x} from "../src/idols100x.sol";

/// @notice Deploy only (no mint). Used when MON is tight; mint in a follow-up script.
contract DeployIdols100xBare is Script {
    address constant DEFAULT_MINTER = 0xa445BaC003026F5aDf51760CA850ad66750e90ad;
    address constant DEFAULT_REGISTRY = 0x000000006551c19487814612e58FE06813775758;
    /// @dev Tokenbound v3 Account Proxy — registry createAccount implementation argument.
    address constant DEFAULT_ACCOUNT_IMPL = 0x55266d75D1a14E4572138116aF39863Ed6596E7F;

    function run() external {
        if (block.chainid != 10143) {
            revert("Idols100x: deploy only on Monad testnet (chainId 10143)");
        }
        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        address initialOwner = vm.envOr("IDOLS100X_OWNER", DEFAULT_MINTER);
        address registry = vm.envOr("IDOLS100X_REGISTRY", DEFAULT_REGISTRY);
        address accountImpl = vm.envOr("IDOLS100X_ACCOUNT_IMPL", DEFAULT_ACCOUNT_IMPL);
        address usdc = vm.envOr("IDOLS100X_USDC", 0x2Ae96dD73d5Cf8f431f2d6e0cf893Db4D64262E8);
        string memory baseURI =
            vm.envOr("IDOLS100X_BASE_URI", string("https://lonelyfuns.vercel.app/api/metadata/"));

        vm.startBroadcast(pk);
        Idols100x nft = new Idols100x(initialOwner, baseURI, registry, accountImpl, usdc);
        vm.stopBroadcast();
        console2.log("Idols100x", address(nft));
        console2.log("owner", nft.owner());
    }
}
