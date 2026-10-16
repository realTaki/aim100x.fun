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
import { APP_ENTRY_POINT } from "./auth/app-wallet-chain.ts";
import {
  encodeAccountExecute,
  encodeAccountExecuteBatch,
  encodeHandleOps,
  packUint128Pair,
} from "./auth/app-wallet-7702.ts";
import {
  encodeAbiParameters,
  encodeEventTopics,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";
const wallet = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const sponsor = "0x3333333333333333333333333333333333333333" as Address;
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
it("checks the fresh image before returning external approval/payment calls", async (t) => {
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
function transferLog(amount: bigint) {
  return {
    address: LONELY_USD_ADDRESS,
    data: encodeAbiParameters([{ type: "uint256" }], [amount]),
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: wallet, to: other },
    }) as Hex[],
  };
}
function sponsoredImageInput(
  payment: Awaited<ReturnType<typeof verifyImagePayment>>,
  mode: "batch" | "execute" = "batch",
) {
  const calls = imagePaymentCalls(payment).map((call) => ({ ...call, value: 0n }));
  const callData =
    mode === "batch"
      ? encodeAccountExecuteBatch(calls)
      : encodeAccountExecute(calls[1]);
  return encodeHandleOps(
    [
      {
        sender: wallet,
        nonce: 0n,
        initCode: "0x",
        callData,
        accountGasLimits: packUint128Pair(1n, 21_000n),
        preVerificationGas: 21_000n,
        gasFees: packUint128Pair(0n, 0n),
        paymasterAndData: "0x",
        signature: "0x",
      },
    ],
    sponsor,
  );
}
it("unlocks only a successful sponsor handleOps bound to this exact checkout; reconfirmation never pays again", async (t) => {
  const { ticket, payment } = await setup(t);
  const tx: {
    from: Address;
    to: Address;
    value: bigint;
    input: Hex;
    blockNumber: bigint;
    chainId: number;
  } = {
    from: sponsor,
    to: APP_ENTRY_POINT,
    value: 0n,
    input: sponsoredImageInput(payment),
    blockNumber: 101n,
    chainId: IDOLS100X_CHAIN_ID,
  };
  let status = "success";
  const reader = () =>
    ({
      getChainId: async () => IDOLS100X_CHAIN_ID,
      getTransaction: async () => tx,
      getTransactionReceipt: async () => ({
        status,
        from: tx.from,
        to: tx.to,
        logs: [transferLog(1_000_000n)],
      }),
    }) as unknown as ReturnType<typeof imagePaymentReader>;
  const deps = { reader, available: async () => {}, sponsor: () => sponsor };
  const result = await settleImagePayment(wallet, wallet, id, ticket, hash, deps);
  const access = new URL(result.imageUrl, "https://aim100x.fun").searchParams.get("access");
  assert.equal(await verifyImageAccess(access, wallet, wallet, id), true);
  assert.equal(await verifyImageAccess(access, other, other, id), false);
  await settleImagePayment(wallet, wallet, id, ticket, hash, deps);
  tx.input = sponsoredImageInput(payment, "execute");
  await settleImagePayment(wallet, wallet, id, ticket, hash, deps);
  const another = await issueImagePayment(wallet, {
    ...payment,
    imageId: "22345678-1234-1234-1234-123456789abc",
  });
  await assert.rejects(
    settleImagePayment(wallet, wallet, "22345678-1234-1234-1234-123456789abc", another, hash, deps),
    /does not match/,
  );
  tx.from = wallet;
  tx.to = IDOLS100X_ADDRESS;
  tx.input = imagePaymentCalls(payment)[1].data;
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, deps),
    /does not match/,
  );
  tx.from = sponsor;
  tx.to = APP_ENTRY_POINT;
  tx.input = sponsoredImageInput(payment);
  status = "reverted";
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, deps),
    /does not match/,
  );
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
