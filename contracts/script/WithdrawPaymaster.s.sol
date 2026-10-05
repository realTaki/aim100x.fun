// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PasskeyPaymaster} from "../src/PasskeyPaymaster.sol";

/// @notice Pull EntryPoint deposit from the passkey paymaster to the minter EOA for contract deploys.
/// Key: PAYMASTER_SIGNER (Grokbot / GROKBOT_WEB3_WALLET) — never log.
contract WithdrawPaymaster is Script {
    PasskeyPaymaster constant PAYMASTER = PasskeyPaymaster(payable(0xe443a26696d6D0D8E8dDF89AaEd21553e906BffE));
    address constant MINTER = 0xa445BaC003026F5aDf51760CA850ad66750e90ad;

    function run() external {
        if (block.chainid != 10143) revert("Monad 10143 only");
        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        uint256 amount = vm.envOr("WITHDRAW_WEI", uint256(0.85 ether));
        vm.startBroadcast(pk);
        PAYMASTER.withdrawTo(payable(MINTER), amount);
        vm.stopBroadcast();
        console2.log("withdrawTo", MINTER);
        console2.log("amount", amount);
    }
}
