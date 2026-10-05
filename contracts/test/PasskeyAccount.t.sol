// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Base64URL} from "../src/libraries/Base64URL.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";
import {PasskeyAccount} from "../src/PasskeyAccount.sol";
import {PasskeyAccountFactory} from "../src/PasskeyAccountFactory.sol";
import {PasskeyPaymaster} from "../src/PasskeyPaymaster.sol";
import {IEntryPoint, UserOperation} from "../src/UserOperation.sol";

contract DummyEntryPoint {
    mapping(address => uint256) public balanceOf;

    function getNonce(address, uint192) external pure returns (uint256) {
        return 0;
    }

    function depositTo(address account) external payable {
        balanceOf[account] += msg.value;
    }

    function addStake(uint32) external payable {
        balanceOf[address(this)] += msg.value;
    }

    function unlockStake() external {}

    function withdrawStake(address payable to) external {
        uint256 n = balanceOf[address(this)];
        balanceOf[address(this)] = 0;
        to.transfer(n);
    }

    function withdrawTo(address payable to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        to.transfer(amount);
    }

    receive() external payable {}
}

contract PasskeyAccountTest is Test {
    DummyEntryPoint internal ep;
    PasskeyAccountFactory internal factory;
    PasskeyPaymaster internal paymaster;

    // EIP-7951 / Wycheproof secp256r1 vector (hash, r, s, qx, qy).
    bytes32 internal constant H0 =
        0xBB5A52F42F9C9261ED4361F59422A1E30036E7C32B270C8807A419FECA605023;
    uint256 internal constant R0 =
        0x2BA3A8BE6B94D5EC80A6D9D1190A436EFFE50D85A1EEE859B8CC6AF9BD5C2E18;
    uint256 internal constant S0 =
        0x4CD60B855D442F5B3C7B11EB6C4E0AE7525FE710FAB9AA7C77A67F79E6FADD76;
    uint256 internal constant X0 =
        0x2927B10512BAE3EDDCFE467828128BAD2903269919F7086069C8C4DF6C732838;
    uint256 internal constant Y0 =
        0xC7787964EAAC00E5921FB1498A60F4606766B3D9685001558D1A974E7341513E;

    uint256 internal constant PX = X0;
    uint256 internal constant PY = Y0;

    function setUp() public {
        ep = new DummyEntryPoint();
        factory = new PasskeyAccountFactory(IEntryPoint(address(ep)), address(0x0100));
        paymaster = new PasskeyPaymaster(IEntryPoint(address(ep)), factory);
    }

    function test_p256PrecompileWycheproofVector() public view {
        assertTrue(WebAuthn.verifyP256(H0, R0, S0, X0, Y0));
        assertFalse(WebAuthn.verifyP256(H0, R0, S0, X0 + 1, Y0));
    }

    function test_create2FromPubkeyNotCredentialId() public {
        bytes memory credA = hex"aa";
        bytes memory credB = hex"bb";
        address a = factory.getAddress(PX, PY);
        PasskeyAccount account = factory.createAccount(PX, PY, credA);
        assertEq(address(account), a);
        assertEq(factory.accountOfCredential(keccak256(credA)), a);
        address again = address(factory.createAccount(PX, PY, credB));
        assertEq(again, a);
        assertEq(factory.getAddress(PX, PY + 1) == a, false);
        assertTrue(factory.isAccount(a));
        assertEq(account.p256Verifier(), address(0x0100));
    }

    function test_saltIsPubkeyHash() public view {
        assertEq(factory.saltOf(PX, PY), keccak256(abi.encodePacked(PX, PY)));
    }

    function test_webAuthnRejectsBadChallenge() public view {
        bytes32 hash = keccak256("lf");
        bytes memory challenge = abi.encodePacked(hash);
        string memory json = string.concat(
            '{"type":"webauthn.get","challenge":"',
            Base64URL.encode(challenge),
            '","origin":"https://lonelyfuns.vercel.app"}'
        );
        bytes memory authData = abi.encodePacked(bytes32(uint256(1)), bytes1(0x05), uint32(1));
        WebAuthn.Auth memory auth = WebAuthn.Auth({
            authenticatorData: authData,
            clientDataJSON: json,
            challengeIndex: 0,
            typeIndex: 1,
            r: R0,
            s: S0
        });
        assertFalse(WebAuthn.verify(challenge, auth, X0, Y0));
    }

    function test_softwareAgentUsesPasskeyAccountSignatureFormat() public view {
        bytes32 userOpHash =
            0xabababababababababababababababababababababababababababababababab;
        WebAuthn.Auth memory auth = WebAuthn.Auth({
            authenticatorData: hex"92714bbbdb349a98c98b44ded6ca99db4cc12b18619eaac462be144283253da30500000000",
            clientDataJSON: '{"type":"webauthn.get","challenge":"q6urq6urq6urq6urq6urq6urq6urq6urq6urq6urq6s","origin":"https://agent.lonelyfuns.local","crossOrigin":false}',
            challengeIndex: 23,
            typeIndex: 1,
            r: 0x5673326bb8f87a76347fcb5dd246a7e6665d7eaf70410879d940a7a3cd95e3c2,
            s: 0x03984f0455084158afcb9448fe7f81e89619ff92f0b50abf8d7a69d0dda7be10
        });
        assertTrue(
            WebAuthn.verify(
                abi.encodePacked(userOpHash),
                auth,
                0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296,
                0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5
            )
        );
    }

    function test_paymasterDefaultMaxCostCoversPimlicoPrefund() public view {
        assertEq(paymaster.maxCostWei(), 50 ether);
    }

    function test_paymasterRejectsOverMaxCost() public {
        PasskeyAccount account = factory.createAccount(PX, PY, hex"01");
        UserOperation memory op;
        op.sender = address(account);
        vm.prank(address(ep));
        vm.expectRevert(PasskeyPaymaster.Rejected.selector);
        paymaster.validatePaymasterUserOp(op, bytes32(0), 50 ether + 1);
    }

    function test_paymasterAcceptsFactoryAccount() public {
        PasskeyAccount account = factory.createAccount(PX, PY, hex"01");
        UserOperation memory op;
        op.sender = address(account);
        op.callData = hex"";
        op.signature = hex"";
        vm.prank(address(ep));
        (bytes memory ctx, uint256 vd) = paymaster.validatePaymasterUserOp(op, bytes32(0), 1e15);
        assertEq(ctx.length, 0);
        assertEq(vd, 0);
    }

    function test_paymasterRejectsUnknownSender() public {
        UserOperation memory op;
        op.sender = address(0xBEEF);
        vm.prank(address(ep));
        vm.expectRevert(PasskeyPaymaster.Rejected.selector);
        paymaster.validatePaymasterUserOp(op, bytes32(0), 1);
    }

    function test_accountExecuteOnlyEntryPoint() public {
        PasskeyAccount account = factory.createAccount(PX, PY, hex"");
        vm.expectRevert(PasskeyAccount.NotEntryPoint.selector);
        account.execute(address(this), 0, "");
    }
}
