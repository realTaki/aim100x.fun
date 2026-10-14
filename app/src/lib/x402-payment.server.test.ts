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
it("retains strict mainnet offer validation without enabling spending", () => {
  assert.equal(validPaymentOffer(MONID_RUN_URL, offer), true);
  for (const changed of [
    { network: "eip155:10143" as const },
    { asset: owner.address },
    { payTo: owner.address },
    { amount: "100001" },
    { amount: "-1" },
    { extra: { ...offer.extra, assetTransferMethod: "permit2" } },
  ])
    assert.equal(validPaymentOffer(MONID_RUN_URL, { ...offer, ...changed }), false);
});
for (const scenario of [
  "funded wallet",
  "zero balance",
  "provider timeout",
  "pricing error",
  "missing settlement",
]) {
  it(`mainnet hard block precedes signing, RPC and provider access: ${scenario}`, async () => {
    let signatures = 0,
      requests = 0,
      balances = 0;
    const account = {
      ...owner,
      signTypedData: async () => {
        signatures++;
        throw new Error("must not sign");
      },
    };
    for (let retry = 0; retry < 2; retry++)
      await assert.rejects(
        paidFetch(
          account,
          MONID_RUN_URL,
          { method: "POST", body: "{}" },
          {
            fetch: async () => {
              requests++;
              throw new Error(scenario);
            },
            balance: async () => {
              balances++;
              return scenario === "zero balance" ? 0n : 5000n;
            },
          },
        ),
        /Mainnet spending and delegation are disabled/,
      );
    assert.deepEqual(
      { signatures, requests, balances },
      { signatures: 0, requests: 0, balances: 0 },
    );
  });
}
