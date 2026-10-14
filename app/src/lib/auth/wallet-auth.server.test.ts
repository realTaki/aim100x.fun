import { afterEach, beforeEach, it } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt } from "jose";
import { deriveAppWallet, deriveIdentityWallet } from "./app-wallet.server.ts";
import { browserIdentity, accountIdFor, type LoginIdentity } from "./identity.ts";
import { mintWalletSessionToken, verifySessionToken } from "./wallet-auth.server.ts";
import { memoryAuthStore } from "./auth-test-store.ts";
const address = "0xa445bac003026f5adf51760ca850ad66750e90ad";
const original = process.env.WALLET_MASTER_SECRET;
beforeEach(() => { process.env.WALLET_MASTER_SECRET="11".repeat(32); });
afterEach(() => { if (original===undefined) delete process.env.WALLET_MASTER_SECRET; else process.env.WALLET_MASTER_SECRET=original; });
it("preserves every browser v1 wallet while isolating provider namespaces", () => {
  const wallet=browserIdentity(address), mera: LoginIdentity={provider:"mera",issuer:"aim100x.fun",subject:address};
  const privy: LoginIdentity={provider:"privy",issuer:"privy.io/app-one",subject:"did:privy:one"};
  assert.equal(deriveIdentityWallet(wallet).account.address,"0xEb77b117A1f0D572BAFe2d0C7f32c3ED9ac665C1");
  assert.equal(deriveIdentityWallet(wallet).account.address,deriveAppWallet(address).account.address);
  assert.equal(deriveIdentityWallet(browserIdentity(address.toUpperCase().replace("0X","0x"))).account.address,deriveAppWallet(address).account.address);
  const ids=[wallet,mera,privy].map(accountIdFor), wallets=[wallet,mera,privy].map(i=>deriveIdentityWallet(i).account.address);
  assert.equal(new Set(ids).size,3); assert.equal(new Set(wallets).size,3);
  assert.equal(deriveIdentityWallet(privy).account.address,deriveIdentityWallet({...privy}).account.address);
  assert.notEqual(accountIdFor(privy),accountIdFor({...privy,issuer:"privy.io/app-two"}));
  assert.notEqual(accountIdFor(mera),accountIdFor({...mera,issuer:"another.domain"}));
});
it("returns the same account on repeated login, with separate revocable sessions", async () => {
  const store=memoryAuthStore(), identity=browserIdentity(address);
  const token=await mintWalletSessionToken(identity,store), other=await mintWalletSessionToken(identity,store);
  const a=await verifySessionToken(token,store), b=await verifySessionToken(other,store);
  assert.equal(a?.id,b?.id); assert.equal(a?.walletAddress,deriveAppWallet(address).account.address);
  assert.notEqual(a?.sessionId,b?.sessionId); assert.notEqual(a?.id,address);
  await store.revoke(a!.sessionId); assert.equal(await verifySessionToken(token,store),null);
  assert.ok(await verifySessionToken(other,store));
  const claims=decodeJwt(other); assert.equal(claims.exp!-claims.iat!,86400);
  assert.doesNotMatch(JSON.stringify(claims),/mnemonic|privateKey/);
});
it("does not silently change a stored wallet after master-secret rotation", async () => {
  const store=memoryAuthStore(), identity=browserIdentity(address);
  await mintWalletSessionToken(identity,store);
  process.env.WALLET_MASTER_SECRET="22".repeat(32);
  await assert.rejects(mintWalletSessionToken(identity,store),/derivation/);
  delete process.env.WALLET_MASTER_SECRET;
  assert.throws(()=>deriveIdentityWallet(identity),/WALLET_MASTER_SECRET/);
  assert.equal(await verifySessionToken("garbage",store),null);
});

it("repeated Privy and Mera sessions preserve account and APP address independently", async () => {
  const store = memoryAuthStore();
  for (const identity of [
    {provider:"privy",issuer:"privy.io/test-app",subject:"did:privy:one"},
    {provider:"mera",issuer:"aim100x.fun",subject:address},
  ] as LoginIdentity[]) {
    const a=await verifySessionToken(await mintWalletSessionToken(identity,store),store);
    const b=await verifySessionToken(await mintWalletSessionToken(identity,store),store);
    assert.ok(a && b); assert.equal(a.id,b.id); assert.equal(a.walletAddress,b.walletAddress);
    assert.notEqual(a.sessionId,b.sessionId); assert.equal(a.loginAddress,null);
  }
});
