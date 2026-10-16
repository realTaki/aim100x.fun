import { it } from "node:test";
import assert from "node:assert/strict";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { APP_ACCOUNT_IMPLEMENTATION, APP_ENTRY_POINT } from "./app-wallet-chain.ts";
import {
  appWalletDelegationCode,
  encodeAccountExecute,
  encodeAccountExecuteBatch,
  encodeHandleOps,
  packUint128Pair,
  sponsoredCallFromHandleOps,
  userOperationTypedData,
} from "./app-wallet-7702.ts";

const sender = "0x1111111111111111111111111111111111111111" as Address;
const target = "0x2222222222222222222222222222222222222222" as Address;
const sponsor = "0x3333333333333333333333333333333333333333" as Address;

it("packs 7702 delegation code, execute calldata and handleOps for a sponsored inner call", () => {
  assert.equal(
    appWalletDelegationCode(),
    `0xef0100${APP_ACCOUNT_IMPLEMENTATION.slice(2)}`.toLowerCase(),
  );
  const inner = { to: target, value: 0n, data: "0xdead" as Hex };
  const userOp = {
    sender,
    nonce: 1n,
    initCode: "0x" as Hex,
    callData: encodeAccountExecute(inner),
    accountGasLimits: packUint128Pair(150_000n, 300_000n),
    preVerificationGas: 80_000n,
    gasFees: packUint128Pair(0n, 0n),
    paymasterAndData: "0x" as Hex,
    signature: "0x" as Hex,
  };
  const decoded = sponsoredCallFromHandleOps(encodeHandleOps([userOp], sponsor));
  assert.deepEqual(decoded, {
    sender,
    to: target,
    value: 0n,
    data: "0xdead",
    beneficiary: sponsor,
  });
  assert.equal(sponsoredCallFromHandleOps("0x"), null);
  assert.equal(sponsoredCallFromHandleOps(inner.data), null);
  assert.throws(() => packUint128Pair(-1n, 0n), /packed gas/);
  assert.throws(() => packUint128Pair(1n << 128n, 0n), /packed gas/);
});

it("round-trips executeBatch and preserves extra inner calldata on the last call", () => {
  const tagged = ("0xdead" + "ab".repeat(32)) as Hex;
  const batch = encodeAccountExecuteBatch([
    { to: target, value: 0n, data: "0x01" },
    { to: sender, value: 0n, data: tagged },
  ]);
  const userOp = {
    sender,
    nonce: 0n,
    initCode: "0x" as Hex,
    callData: batch,
    accountGasLimits: packUint128Pair(1n, 21_000n),
    preVerificationGas: 21_000n,
    gasFees: packUint128Pair(0n, 0n),
    paymasterAndData: "0x" as Hex,
    signature: "0x" as Hex,
  };
  const decoded = sponsoredCallFromHandleOps(encodeHandleOps([userOp], sponsor));
  assert.deepEqual(decoded, {
    sender,
    to: sender,
    value: 0n,
    data: tagged,
    beneficiary: sponsor,
  });
  assert.throws(() => encodeAccountExecuteBatch([{ to: target, value: 0n, data: "0x" }]), /Batch/);
  assert.throws(
    () =>
      encodeAccountExecuteBatch([
        { to: target, value: 0n, data: "0x01" },
        { to: target, value: 1n, data: "0x" },
      ]),
    /Native value/,
  );
});

it("signs the EntryPoint v0.8 PackedUserOperation typed data with the APP wallet key", async () => {
  const owner = privateKeyToAccount(("0x" + "11".repeat(32)) as Hex);
  const unsigned = {
    sender: owner.address,
    nonce: 0n,
    initCode: "0x" as Hex,
    callData: encodeAccountExecute({ to: target, value: 0n, data: "0x" }),
    accountGasLimits: packUint128Pair(1n, 21_000n),
    preVerificationGas: 21_000n,
    gasFees: packUint128Pair(0n, 0n),
    paymasterAndData: "0x" as Hex,
  };
  const typed = userOperationTypedData(unsigned);
  assert.equal(typed.domain.verifyingContract, APP_ENTRY_POINT);
  assert.equal(typed.domain.chainId, 10143);
  const signature = await owner.signTypedData(typed);
  assert.equal(
    (await recoverTypedDataAddress({ ...typed, signature })).toLowerCase(),
    owner.address.toLowerCase(),
  );
});
