// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PasskeyPaymaster} from "../src/PasskeyPaymaster.sol";

/// @notice Raise the live paymaster maxCostWei so Pimlico prefunder is not AA33.
/// Key: PAYMASTER_SIGNER (GROKBOT_WEB3_WALLET). Never log. Never touch 0xe541…
contract SetPaymasterMaxCost is Script {
    PasskeyPaymaster constant PAYMASTER = PasskeyPaymaster(payable(0xe443a26696d6D0D8E8dDF89AaEd21553e906BffE));

    function run() external {
        if (block.chainid != 10143) revert("Monad 10143 only");
        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        uint256 next = vm.envOr("MAX_COST_WEI", uint256(50 ether));
        vm.startBroadcast(pk);
        PAYMASTER.setMaxCost(next);
        vm.stopBroadcast();
        console2.log("maxCostWei", PAYMASTER.maxCostWei());
    }
}
