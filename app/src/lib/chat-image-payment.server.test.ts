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
import { IDOLS100X_ADDRESS, IDOLS100X_CHAIN_ID } from "./idols100x.ts";
import type { Address, Hex } from "viem";
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
it("unlocks only a successful external-wallet transaction bound to this exact checkout; reconfirmation never pays again", async (t) => {
  const { ticket, payment } = await setup(t);
  const tx = {
    from: wallet,
    to: IDOLS100X_ADDRESS,
    value: 0n,
    input: imagePaymentCalls(payment)[1].data,
    blockNumber: 101n,
  };
  let status = "success";
  const reader = () =>
    ({
      getChainId: async () => IDOLS100X_CHAIN_ID,
      getTransaction: async () => tx,
      getTransactionReceipt: async () => ({ status }),
    }) as unknown as ReturnType<typeof imagePaymentReader>;
  const deps = { reader, available: async () => {} };
  const result = await settleImagePayment(wallet, wallet, id, ticket, hash, deps);
  const access = new URL(result.imageUrl, "https://aim100x.fun").searchParams.get("access");
  assert.equal(await verifyImageAccess(access, wallet, wallet, id), true);
  assert.equal(await verifyImageAccess(access, other, other, id), false);
  await settleImagePayment(wallet, wallet, id, ticket, hash, deps);
  const another = await issueImagePayment(wallet, {
    ...payment,
    imageId: "22345678-1234-1234-1234-123456789abc",
  });
  await assert.rejects(
    settleImagePayment(wallet, wallet, "22345678-1234-1234-1234-123456789abc", another, hash, deps),
    /does not match/,
  );
  tx.from = other;
  await assert.rejects(
    settleImagePayment(wallet, wallet, id, ticket, hash, deps),
    /does not match/,
  );
  tx.from = wallet;
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
