import { it } from "node:test";
import assert from "node:assert/strict";
import { paidFetch, MONID_RUN_URL } from "../x402-payment.server.ts";
import { ensureAppWalletDelegation } from "./app-wallet-executor.server.ts";
import { mainnetWalletChain } from "./app-wallet-chain.ts";
import type { PrivateKeyAccount } from "viem/accounts";

it("blocks mainnet payment and delegation before touching keys, RPC or providers", async () => {
  const owner = new Proxy({} as PrivateKeyAccount, {
    get() { assert.fail("Must not access a signing account"); },
  });
  await assert.rejects(paidFetch(owner, MONID_RUN_URL, {}, {
    fetch: async () => { assert.fail("Must not call a provider"); },
    balance: async () => { assert.fail("Must not call RPC"); },
  }), /Mainnet spending and delegation are disabled/);
  await assert.rejects(ensureAppWalletDelegation(owner, mainnetWalletChain),
    /Mainnet spending and delegation are disabled/);
});
