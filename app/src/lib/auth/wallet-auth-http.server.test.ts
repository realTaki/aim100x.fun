import { afterEach, beforeEach, it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
import { handleWalletAuthRequest, sessionUserFromRequest } from "./wallet-auth-http.server.ts";
import { deriveAppWallet } from "./app-wallet.server.ts";
import { SESSION_TOKEN_COOKIE } from "./wallet-auth.server.ts";
const external = privateKeyToAccount(("0x" + "01".repeat(32)) as `0x${string}`);
const original = process.env.WALLET_MASTER_SECRET;
beforeEach(() => {
  process.env.WALLET_MASTER_SECRET = "33".repeat(32);
});
afterEach(() => {
  if (original === undefined) delete process.env.WALLET_MASTER_SECRET;
  else process.env.WALLET_MASTER_SECRET = original;
});
const origin = "https://aim100x.fun";
function req(path: string, body: unknown, cookie?: string, source = origin) {
  return new Request(`${origin}/api/auth/${path}`, {
    method: "POST",
    headers: { origin: source, "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}
async function challenge() {
  const res = await handleWalletAuthRequest(req("wallet/challenge", { address: external.address }));
  assert.equal(res.status, 200);
  return {
    message: (await res.json()).message as string,
    cookie: res.headers.getSetCookie()[0].split(";")[0],
  };
}
it("signs in with external wallet, initializes its derived EOA and restores from HttpOnly cookie", async () => {
  const c = await challenge();
  const signature = await external.signMessage({ message: c.message });
  let initialized: string | undefined;
  const res = await handleWalletAuthRequest(
    req("wallet/verify", { message: c.message, signature }, c.cookie),
    {
      initialize: async (identity) => {
        initialized = identity;
        return deriveAppWallet(identity).account.address;
      },
      verifySignature: (message, sig, address) =>
        verifyMessage({ message, signature: sig, address }),
    },
  );
  assert.equal(res.status, 200);
  assert.equal(initialized, external.address);
  const body = await res.json();
  assert.equal(body.address, deriveAppWallet(external.address).account.address);
  assert.equal(body.token, undefined);
  const cookies = res.headers.getSetCookie();
  const session = cookies.find((c) => c.startsWith(SESSION_TOKEN_COOKIE + "="))!;
  assert.match(session, /HttpOnly/);
  assert.match(session, /SameSite=Strict/);
  assert.match(
    cookies.find((c) => c.startsWith("__Host-aim-wallet.challenge="))!,
    /Max-Age=0/,
  );
  const user = await sessionUserFromRequest(
    new Request(origin, { headers: { cookie: session.split(";")[0] } }),
  );
  assert.equal(user?.id, external.address.toLowerCase());
  assert.equal(user?.walletAddress, body.address);
  const denied = await handleWalletAuthRequest(
    req("wallet/send", { calls: [] }, session.split(";")[0]),
  );
  assert.equal(denied.status, 403);
});
it("rejects changed challenges, signatures from other wallets, missing cookies and sibling origins", async () => {
  const c = await challenge();
  const wrong = privateKeyToAccount(("0x" + "02".repeat(32)) as `0x${string}`);
  const signature = await wrong.signMessage({ message: c.message });
  let called = false;
  const deps = {
    initialize: async () => {
      called = true;
      return external.address;
    },
    verifySignature: (message: string, sig: `0x${string}`, address: `0x${string}`) =>
      verifyMessage({ message, signature: sig, address }),
  };
  assert.equal(
    (
      await handleWalletAuthRequest(
        req("wallet/verify", { message: c.message, signature }, c.cookie),
        deps,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await handleWalletAuthRequest(
        req("wallet/verify", { message: c.message + "changed", signature }, c.cookie),
        deps,
      )
    ).status,
    401,
  );
  assert.equal(
    (await handleWalletAuthRequest(req("wallet/verify", { message: c.message, signature }), deps))
      .status,
    401,
  );
  assert.equal(
    (
      await handleWalletAuthRequest(
        req(
          "wallet/challenge",
          { address: external.address },
          undefined,
          "https://evil.aim100x.fun",
        ),
      )
    ).status,
    403,
  );
  assert.equal(called, false);
});
it("ignores bearer tokens and rejects unauthenticated sponsorship", async () => {
  assert.equal(
    await sessionUserFromRequest(
      new Request(origin, { headers: { Authorization: "Bearer legacy" } }),
    ),
    null,
  );
  assert.equal((await handleWalletAuthRequest(req("wallet/send", { calls: [] }))).status, 401);
});
