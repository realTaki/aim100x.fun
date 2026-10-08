import { it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { paidFetch, validPaymentOffer, MONID_RUN_URL } from "./x402-payment.server.ts";
import { MONAD_USDC } from "./auth/app-wallet-chain.ts";
const owner = privateKeyToAccount(("0x" + "01".repeat(32)) as `0x${string}`);
const offer = {
  network: "eip155:143" as const,
  scheme: "exact",
  amount: "5000",
  asset: MONAD_USDC,
  payTo: "0x9D3d9410Be95fa1d230734B961997427fc61D837",
  maxTimeoutSeconds: 300,
  extra: { name: "USDC", version: "2" },
};
const challenge = () =>
  new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": Buffer.from(
        JSON.stringify({
          x402Version: 2,
          resource: { url: MONID_RUN_URL, description: "Chat", mimeType: "application/json" },
          accepts: [offer],
        }),
      ).toString("base64"),
    },
  });
it("automatically signs exactly one mainnet USDC payment with this user's EOA", async () => {
  const requests: Request[] = [];
  const mock = (async (input) => {
    const req = input as Request;
    requests.push(req);
    if (requests.length === 1) return challenge();
    const payload = JSON.parse(
      Buffer.from(req.headers.get("PAYMENT-SIGNATURE")!, "base64").toString(),
    );
    assert.equal(payload.accepted.network, "eip155:143");
    assert.equal(payload.payload.authorization.from.toLowerCase(), owner.address.toLowerCase());
    assert.equal(payload.payload.authorization.value, "5000");
    assert.match(payload.payload.signature, /^0x[0-9a-f]{130}$/i);
    return new Response('{"choices":[]}', {
      headers: {
        "PAYMENT-RESPONSE": Buffer.from(
          JSON.stringify({
            success: true,
            network: "eip155:143",
            payer: owner.address,
            transaction: "0x" + "11".repeat(32),
          }),
        ).toString("base64"),
      },
    });
  }) as typeof fetch;
  assert.equal(
    (
      await paidFetch(
        owner,
        MONID_RUN_URL,
        { method: "POST", body: "{}" },
        { fetch: mock, balance: async () => 5000n },
      )
    ).status,
    200,
  );
  assert.equal(requests.length, 2);
});
it("rejects wrong chains, tokens, recipients, excessive quotes and Permit2 before signing", () => {
  assert.equal(validPaymentOffer(MONID_RUN_URL, offer), true);
  for (const changed of [
    { network: "eip155:10143" as const },
    { asset: "0x" + "11".repeat(20) },
    { payTo: owner.address },
    { amount: "100001" },
    { amount: "-1" },
    { extra: { ...offer.extra, assetTransferMethod: "permit2" } },
  ])
    assert.equal(validPaymentOffer(MONID_RUN_URL, { ...offer, ...changed }), false);
});
it("does not send a signed request when balance is insufficient", async () => {
  let requests = 0;
  await assert.rejects(
    paidFetch(
      owner,
      MONID_RUN_URL,
      { method: "POST", body: "{}" },
      {
        fetch: (async () => {
          requests++;
          return challenge();
        }) as typeof fetch,
        balance: async () => 0n,
      },
    ),
    /充值/,
  );
  assert.equal(requests, 1);
});
it("does not retry an ambiguous paid request", async () => {
  let requests = 0;
  await assert.rejects(
    paidFetch(
      owner,
      MONID_RUN_URL,
      { method: "POST", body: "{}" },
      {
        fetch: (async () => {
          if (++requests === 1) return challenge();
          throw new Error("timeout");
        }) as typeof fetch,
        balance: async () => 5000n,
      },
    ),
    /confirmation is unavailable/,
  );
  assert.equal(requests, 2);
});
it("rejects a provider pricing error before sending authorization", async () => {
  let requests = 0;
  await assert.rejects(
    paidFetch(
      owner,
      MONID_RUN_URL,
      { method: "POST", body: "{}" },
      {
        fetch: (async () => {
          requests++;
          return new Response("{}", {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": Buffer.from(
                JSON.stringify({
                  x402Version: 2,
                  resource: {
                    url: MONID_RUN_URL,
                    description: "ERROR: Unable to calculate price.",
                    mimeType: "application/json",
                  },
                  accepts: [offer],
                }),
              ).toString("base64"),
            },
          });
        }) as typeof fetch,
        balance: async () => 5000n,
      },
    ),
    /valid price/,
  );
  assert.equal(requests, 1);
});
it("does not silently accept a paid response without a settlement receipt", async () => {
  let requests = 0;
  await assert.rejects(
    paidFetch(
      owner,
      MONID_RUN_URL,
      { method: "POST", body: "{}" },
      {
        fetch: (async () => (++requests === 1 ? challenge() : new Response("{}"))) as typeof fetch,
        balance: async () => 5000n,
      },
    ),
    /no settlement receipt/,
  );
  assert.equal(requests, 2);
});
