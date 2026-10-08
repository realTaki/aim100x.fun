import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, decodeJwt } from "jose";
import { deriveAppWallet, sessionSigningKey } from "./app-wallet.server.ts";
import { mintWalletSessionToken, verifySessionToken } from "./wallet-auth.server.ts";
const LOGIN = "0xa445bac003026f5adf51760ca850ad66750e90ad" as const;
const original = process.env.WALLET_MASTER_SECRET;
beforeEach(() => {
  process.env.WALLET_MASTER_SECRET = "11".repeat(32);
});
afterEach(() => {
  if (original === undefined) delete process.env.WALLET_MASTER_SECRET;
  else process.env.WALLET_MASTER_SECRET = original;
});
describe("Application EOA identity and sessions", () => {
  it("restores the same BIP39 EOA for normalized login identity, distinct from the login wallet", () => {
    const one = deriveAppWallet(LOGIN);
    const two = deriveAppWallet(LOGIN.toUpperCase().replace("0X", "0x"));
    assert.equal(one.account.address, two.account.address);
    assert.notEqual(one.account.address.toLowerCase(), LOGIN);
    assert.equal(one.mnemonic.split(" ").length, 24);
    assert.notEqual(one.account.address, deriveAppWallet("0x" + "22".repeat(20)).account.address);
    assert.notEqual(one.account.address, deriveAppWallet(LOGIN, "22".repeat(32)).account.address);
  });
  it("binds a verified session to the login wallet and derived EOA", async () => {
    const token = await mintWalletSessionToken(LOGIN);
    const session = await verifySessionToken(token);
    assert.equal(session?.loginAddress?.toLowerCase(), LOGIN);
    assert.equal(session?.id, LOGIN);
    assert.equal(session?.walletAddress, deriveAppWallet(LOGIN).account.address);
    assert.equal(session?.embedded, false);
    const claims = decodeJwt(token);
    assert.equal(claims.exp! - claims.iat!, 86400);
    assert.equal(JSON.stringify(claims).includes("mnemonic"), false);
  });
  it("rejects forged, expired, mismatched and legacy unsigned sessions", async () => {
    const claims = { typ: "app-wallet", login: LOGIN };
    const mint = (key: Uint8Array, sub: string, exp: string) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("aim100x.fun/wallet-login/v1")
        .setAudience("app")
        .setSubject(sub)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(key);
    const address = deriveAppWallet(LOGIN).account.address.toLowerCase();
    assert.equal(
      await verifySessionToken(await mint(new TextEncoder().encode("forged-key"), address, "1h")),
      null,
    );
    assert.equal(await verifySessionToken(await mint(sessionSigningKey(), address, "-1h")), null);
    assert.equal(await verifySessionToken(await mint(sessionSigningKey(), LOGIN, "1h")), null);
    assert.equal(await verifySessionToken("not-a-jwt"), null);
    assert.equal(
      await verifySessionToken(
        await new SignJWT({ typ: "passkey", px: "x", py: "y", cid: "id" })
          .setProtectedHeader({ alg: "HS256" })
          .setSubject(LOGIN)
          .sign(new TextEncoder().encode("lonelyfuns-passkey-session")),
      ),
      null,
    );
  });
  it("fails closed when the persistent wallet master secret is absent", async () => {
    delete process.env.WALLET_MASTER_SECRET;
    assert.throws(() => deriveAppWallet(LOGIN), /WALLET_MASTER_SECRET/);
    assert.equal(await verifySessionToken("anything"), null);
  });
});
