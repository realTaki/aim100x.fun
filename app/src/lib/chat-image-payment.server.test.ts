import { it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  issueImagePayment,
  verifyImagePayment,
  prepareImagePayment,
  settleImagePayment,
  imagePaymentCalls,
  imagePaymentReader,
  verifyImageAccess,
} from "./chat-image-payment.server.ts";
import {
  ImageUnavailableError,
  requireAvailablePaymentImage,
} from "./chat-image-availability.server.ts";
import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID, LONELY_USD_ADDRESS } from "./idols100x.ts";
import {
  erc20Abi,
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { APP_ENTRY_POINT } from "./auth/app-wallet-chain.ts";
import {
  encodeHandleOps,
  encodeAccountExecute,
  encodeAccountExecuteBatch,
  packUint128Pair,
  type PackedUserOperation,
} from "./auth/app-wallet-7702.ts";
const wallet = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const id = "12345678-1234-1234-1234-123456789abc";
const hash = `0x${"ab".repeat(32)}` as Hex;
async function setup(t: TestContext) {
  const previous = process.env.WALLET_MASTER_SECRET;
  process.env.WALLET_MASTER_SECRET = "11".repeat(32);
  t.after(() => {
    if (previous === undefined) delete process.env.WALLET_MASTER_SECRET;
    else process.env.WALLET_MASTER_SECRET = previous;
  });
  const ticket = await issueImagePayment(wallet, {
    imageId: id,
    tokenId: 7,
    amount: "1000000",
    wallet,
    fromBlock: "100",
  });
  const payment = await verifyImagePayment(ticket, wallet, id, wallet);
  return { ticket, payment };
}
it("checks the fresh image before returning APP approval/payment calls", async (t) => {
  const { ticket } = await setup(t);
  let checked = 0;
  const result = await prepareImagePayment(wallet, wallet, id, ticket, async (image, token) => {
    assert.equal(image, id.replace(/-/g, ""));
    assert.equal(token, 7);
    checked++;
  });
  assert.equal(checked, 1);
  assert.equal(result.calls[1].to, IDOLS100X_ADDRESS);
  assert.equal(result.amount, "1000000");
  await assert.rejects(
    prepareImagePayment(wallet, wallet, id, ticket, async () => {
      throw new ImageUnavailableError();
    }),
    ImageUnavailableError,
  );
  await assert.rejects(
    prepareImagePayment(other, other, id, ticket, async () =>
      assert.fail("Do not inspect another user's checkout"),
    ),
    /authorization/,
  );
});
function evidence(payment: Awaited<ReturnType<typeof verifyImagePayment>>) {
  const userOp: PackedUserOperation = {
    sender: wallet,
    nonce: 0n,
    initCode: "0x",
    callData: encodeAccountExecuteBatch(
      imagePaymentCalls(payment).map((call) => ({ ...call, value: 0n })),
    ),
    accountGasLimits: packUint128Pair(150000n, 300000n),
    preVerificationGas: 80000n,
    gasFees: packUint128Pair(0n, 0n),
    paymasterAndData: "0x",
    signature: "0x01",
  };
  const blockHash = `0x${"cd".repeat(32)}` as Hex;
  const tx = {
    hash,
    chainId: IDOLS100X_CHAIN_ID,
    from: other,
    to: APP_ENTRY_POINT as Address,
    value: 0n,
    input: encodeHandleOps([userOp], other),
    blockNumber: 101n,
    blockHash,
  };
  const paidAbi = parseAbi([
    "event Paid(address indexed payer, uint256 indexed tokenId, uint256 amount)",
  ]);
  const log = {
    address: IDOLS100X_ADDRESS as Address,
    data: encodeAbiParameters([{ type: "uint256" }], [BigInt(payment.amount)]),
    topics: encodeEventTopics({
      abi: paidAbi,
      eventName: "Paid",
      args: { payer: wallet, tokenId: BigInt(payment.tokenId) },
    }),
    removed: false,
  };
  const transfer = {
    address: LONELY_USD_ADDRESS as Address,
    data: log.data,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: wallet, to: other },
    }),
    removed: false,
  };
  const receipt = {
    transactionHash: hash,
    status: "success",
    blockNumber: 101n,
    blockHash,
    from: other,
    to: APP_ENTRY_POINT as Address,
    logs: [log, transfer],
  };
  const reader = () =>
    ({
      getChainId: async () => IDOLS100X_CHAIN_ID,
      getTransaction: async () => tx,
      getTransactionReceipt: async () => receipt,
    }) as unknown as ReturnType<typeof imagePaymentReader>;
  return {
    tx,
    receipt,
    userOp,
    log,
    deps: { reader, available: async () => {}, sponsor: () => other },
  };
}
it("unlocks an exact sponsored APP payment; read-only reconfirmation never pays again", async (t) => {
  const { ticket, payment } = await setup(t),
    f = evidence(payment);
  const result = await settleImagePayment(wallet, wallet, id, ticket, hash, f.deps);
  const access = new URL(result.imageUrl, "https://aim100x.fun").searchParams.get("access");
  assert.equal(await verifyImageAccess(access, wallet, wallet, id), true);
  assert.equal(await verifyImageAccess(access, other, other, id), false);
  await settleImagePayment(wallet, wallet, id, ticket, hash, f.deps);
  const another = await issueImagePayment(wallet, {
    ...payment,
    imageId: "22345678-1234-1234-1234-123456789abc",
  });
  await assert.rejects(
    settleImagePayment(
      wallet,
      wallet,
      "22345678-1234-1234-1234-123456789abc",
      another,
      hash,
      f.deps,
    ),
    /does not match/,
  );
});
it("rejects another sender, target, checkout, chain or inconsistent mined evidence", async (t) => {
  const { ticket, payment } = await setup(t);
  for (const mutate of [
    (f: ReturnType<typeof evidence>) => {
      f.userOp.sender = other;
      f.tx.input = encodeHandleOps([f.userOp], other);
    },
    (f: ReturnType<typeof evidence>) => {
      f.tx.input = encodeHandleOps([f.userOp, f.userOp], other);
    },
    (f: ReturnType<typeof evidence>) => {
      f.userOp.callData = encodeAccountExecute({ ...imagePaymentCalls(payment)[0], value: 0n });
      f.tx.input = encodeHandleOps([f.userOp], other);
    },
    (f: ReturnType<typeof evidence>) => {
      f.tx.chainId = 143;
    },
    (f: ReturnType<typeof evidence>) => {
      f.tx.to = IDOLS100X_ADDRESS;
    },
    (f: ReturnType<typeof evidence>) => {
      f.receipt.status = "reverted";
    },
    (f: ReturnType<typeof evidence>) => {
      f.receipt.blockNumber = 99n;
    },
    (f: ReturnType<typeof evidence>) => {
      f.tx.blockNumber = 99n;
    },
    (f: ReturnType<typeof evidence>) => {
      f.receipt.transactionHash = `0x${"ef".repeat(32)}`;
    },
    (f: ReturnType<typeof evidence>) => {
      f.receipt.blockHash = `0x${"ef".repeat(32)}`;
    },
  ]) {
    const f = evidence(payment);
    mutate(f);
    await assert.rejects(
      settleImagePayment(wallet, wallet, id, ticket, hash, f.deps),
      /does not match/,
    );
  }
});
it("outer success alone cannot unlock: require exactly one matching collection Paid log", async (t) => {
  const { ticket, payment } = await setup(t);
  for (const mutate of [
    (f: ReturnType<typeof evidence>) => {
      f.receipt.logs = [];
    },
    (f: ReturnType<typeof evidence>) => {
      f.log.address = other;
    },
    (f: ReturnType<typeof evidence>) => {
      f.log.removed = true;
    },
    (f: ReturnType<typeof evidence>) => {
      f.log.data = encodeAbiParameters([{ type: "uint256" }], [1n]);
    },
    (f: ReturnType<typeof evidence>) => {
      f.receipt.logs.push(f.log);
    },
  ]) {
    const f = evidence(payment);
    mutate(f);
    await assert.rejects(
      settleImagePayment(wallet, wallet, id, ticket, hash, f.deps),
      /Paid receipt/,
    );
  }
});
it("availability fails closed for archived/missing originals and storage failures", async () => {
  await assert.rejects(
    requireAvailablePaymentImage(id, 7, {
      findImageKey: async () => undefined,
      objectExists: async () => assert.fail(),
    }),
    ImageUnavailableError,
  );
  await assert.rejects(
    requireAvailablePaymentImage(id, 7, {
      findImageKey: async () => "key",
      objectExists: async () => false,
    }),
    ImageUnavailableError,
  );
  await assert.rejects(
    requireAvailablePaymentImage(id, 7, {
      findImageKey: async () => {
        throw new Error("database unavailable");
      },
      objectExists: async () => true,
    }),
    ImageUnavailableError,
  );
});

it("rejects unexpected batch prefixes, suffixes, approval amounts and native value", async (t) => {
  const { ticket, payment } = await setup(t);
  const exact = imagePaymentCalls(payment).map((call) => ({ ...call, value: 0n }));
  const { SIMPLE_7702_ABI } = await import("./auth/app-wallet-7702.ts");
  const { encodeFunctionData, erc20Abi } = await import("viem");
  for (const calls of [
    [{ to: other, value: 0n, data: "0x" as Hex }, ...exact],
    [...exact, { to: other, value: 0n, data: "0x" as Hex }],
    [exact[1], exact[0]],
    [
      {
        ...exact[0],
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [IDOLS100X_ADDRESS, 1n],
        }),
      },
      exact[1],
    ],
    [{ ...exact[0], to: other }, exact[1]],
    [{ ...exact[0], value: 1n }, exact[1]],
    [exact[1]],
  ]) {
    const f = evidence(payment);
    // Encode malicious input directly, bypassing the safe encoder's value/count guards.
    f.userOp.callData = encodeFunctionData({
      abi: SIMPLE_7702_ABI,
      functionName: "executeBatch",
      args: [calls.map((call) => ({ target: call.to, value: call.value, data: call.data }))],
    });
    f.tx.input = encodeHandleOps([f.userOp], other);
    await assert.rejects(
      settleImagePayment(wallet, wallet, id, ticket, hash, f.deps),
      /does not match/,
    );
  }
});
it("can reconcile an already-submitted legacy single tagged pay without sending again", async (t) => {
  const { ticket, payment } = await setup(t),
    f = evidence(payment);
  f.userOp.callData = encodeAccountExecute({ ...imagePaymentCalls(payment)[1], value: 0n });
  f.tx.input = encodeHandleOps([f.userOp], other);
  assert.ok((await settleImagePayment(wallet, wallet, id, ticket, hash, f.deps)).imageUrl);
});
it("a token Transfer without collection Paid never authorizes image access", async (t) => {
  const { ticket, payment } = await setup(t),
    f = evidence(payment);
  const { LONELY_USD_ADDRESS } = await import("./idols100x.ts");
  const { erc20Abi } = await import("viem");
  f.log.address = LONELY_USD_ADDRESS;
  f.log.topics = encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from: wallet, to: other },
  }) as typeof f.log.topics;
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, f.deps),
    /Paid receipt/,
  );
});
it("rejects Paid events for a different payer or token even with exact batch calldata", async (t) => {
  const { ticket, payment } = await setup(t);
  const abi = parseAbi([
    "event Paid(address indexed payer, uint256 indexed tokenId, uint256 amount)",
  ]);
  for (const args of [
    { payer: other, tokenId: BigInt(payment.tokenId) },
    { payer: wallet, tokenId: BigInt(payment.tokenId) + 1n },
  ]) {
    const f = evidence(payment);
    f.log.topics = encodeEventTopics({ abi, eventName: "Paid", args });
    await assert.rejects(
      settleImagePayment(wallet, wallet, id, ticket, hash, f.deps),
      /Paid receipt/,
    );
  }
});
it("preserves the deployed sponsor and Transfer requirements in addition to Paid", async (t) => {
  const { ticket, payment } = await setup(t);
  const missing = evidence(payment);
  missing.receipt.logs = [missing.log];
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, missing.deps),
    /Transfer receipt/,
  );
  const wrongSponsor = evidence(payment);
  wrongSponsor.deps.sponsor = () => wallet;
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, wrongSponsor.deps),
    /does not match/,
  );
  const wrongHash = evidence(payment);
  wrongHash.tx.hash = `0x${"00".repeat(32)}`;
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, wrongHash.deps),
    /does not match/,
  );
});
