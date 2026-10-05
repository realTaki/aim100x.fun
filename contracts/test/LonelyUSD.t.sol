// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LonelyUSD} from "../src/LonelyUSD.sol";

contract SmartAccountStub {
    function executeFaucet(LonelyUSD token) external {
        token.faucet();
    }
}

contract LonelyUSDTest is Test {
    LonelyUSD internal token;
    address internal minter = address(0xA445);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);
    SmartAccountStub internal account;

    function setUp() public {
        token = new LonelyUSD(minter);
        account = new SmartAccountStub();
        vm.warp(1_700_000_000);
    }

    function test_metadataAndMinter() public view {
        assertEq(token.name(), "LonelyUSD");
        assertEq(token.symbol(), "LUSD");
        assertEq(token.decimals(), 6);
        assertEq(token.FAUCET_AMOUNT(), 100_000_000);
        assertEq(token.FAUCET_COOLDOWN(), 24 hours);
        assertEq(token.minter(), minter);
        assertEq(token.totalSupply(), 0);
    }

    function test_mintOnlyMinter() public {
        vm.prank(minter);
        token.mint(alice, 1_000_000);
        assertEq(token.balanceOf(alice), 1_000_000);
        assertEq(token.totalSupply(), 1_000_000);

        vm.prank(alice);
        vm.expectRevert(LonelyUSD.Unauthorized.selector);
        token.mint(alice, 1);
    }

    function test_faucetCreditsCallerNotOrigin() public {
        account.executeFaucet(token);
        assertEq(token.balanceOf(address(account)), 100_000_000);
        assertEq(token.balanceOf(address(this)), 0);
        assertEq(token.lastFaucetAt(address(account)), block.timestamp);
        assertEq(token.lastFaucetAt(tx.origin), 0);
    }

    function test_faucetCooldownPerAddress() public {
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 100_000_000);

        vm.prank(alice);
        vm.expectRevert(LonelyUSD.Cooldown.selector);
        token.faucet();

        vm.prank(bob);
        token.faucet();
        assertEq(token.balanceOf(bob), 100_000_000);

        vm.warp(block.timestamp + 24 hours - 1);
        vm.prank(alice);
        vm.expectRevert(LonelyUSD.Cooldown.selector);
        token.faucet();

        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        token.faucet();
        assertEq(token.balanceOf(alice), 200_000_000);
    }

    function test_transferAndApprove() public {
        vm.prank(minter);
        token.mint(alice, 5_000_000);
        vm.prank(alice);
        token.transfer(bob, 1_000_000);
        assertEq(token.balanceOf(bob), 1_000_000);

        vm.prank(alice);
        token.approve(bob, 2_000_000);
        vm.prank(bob);
        token.transferFrom(alice, bob, 2_000_000);
        assertEq(token.balanceOf(bob), 3_000_000);
        assertEq(token.allowance(alice, bob), 0);
    }
}
