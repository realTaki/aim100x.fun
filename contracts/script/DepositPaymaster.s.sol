// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PasskeyPaymaster} from "../src/PasskeyPaymaster.sol";

/// @notice Top up the passkey paymaster EntryPoint deposit from the Grokbot EOA.
/// Key: PAYMASTER_SIGNER (GROKBOT_WEB3_WALLET). Never log. Never touch 0xe541…
contract DepositPaymaster is Script {
    PasskeyPaymaster constant PAYMASTER = PasskeyPaymaster(payable(0xe443a26696d6D0D8E8dDF89AaEd21553e906BffE));
    address constant MINTER = 0xa445BaC003026F5aDf51760CA850ad66750e90ad;

    function run() external {
        if (block.chainid != 10143) revert("Monad 10143 only");
        uint256 pk = vm.envOr("PAYMASTER_SIGNER", vm.envUint("GROKBOT_WEB3_WALLET"));
        uint256 amount = vm.envOr("DEPOSIT_WEI", uint256(50 ether));
        vm.startBroadcast(pk);
        PAYMASTER.deposit{value: amount}();
        vm.stopBroadcast();
        console2.log("deposit from", MINTER);
        console2.log("amount", amount);
    }
}
