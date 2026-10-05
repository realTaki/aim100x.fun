import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LAST_WALLET_ADDRESS_KEY,
  LAST_WALLET_ID_KEY,
  WALLET_BEARER_KEY,
  clearPersistedWalletSession,
  readPersistedWalletSession,
  reconcilePasskeySession,
  writePersistedWalletSession,
  type StorageLike,
} from "./wallet-session.ts";

const ADDR_A = "0xA445BaC003026F5aDf51760CA850ad66750e90ad";
const ADDR_A_LC = ADDR_A.toLowerCase();
const ADDR_B = "0xe541ba52e2eff4fec12441c77f73352d885e183a";

function mem(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem(key) {
      return Object.hasOwn(data, key) ? data[key]! : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

describe("reconcilePasskeySession", () => {
  it("stays signed in from the stored passkey account when /get-session is empty", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: null,
        jwtEmbedded: false,
        isPasskeyWalletId: true,
        rememberedAddress: ADDR_A,
        passkeyRecordAddress: ADDR_A,
      }),
      { userId: ADDR_A_LC, reason: "ok" },
    );
  });

  it("stays signed in from the remembered passkey address even without a local record", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: null,
        jwtEmbedded: false,
        isPasskeyWalletId: true,
        rememberedAddress: ADDR_A,
        passkeyRecordAddress: null,
      }),
      { userId: ADDR_A_LC, reason: "ok" },
    );
  });

  it("prefers a verified passkey JWT over a stale remembered address", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: ADDR_A,
        jwtEmbedded: true,
        isPasskeyWalletId: true,
        rememberedAddress: ADDR_B,
        passkeyRecordAddress: ADDR_B,
      }),
      { userId: ADDR_A_LC, reason: "ok" },
    );
  });

  it("does not treat a non-embedded JWT as a passkey session", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: ADDR_A,
        jwtEmbedded: false,
        isPasskeyWalletId: false,
        rememberedAddress: null,
        passkeyRecordAddress: null,
      }),
      { userId: null, reason: "no_session" },
    );
  });

  it("requires WebAuthn re-auth when the stored passkey record is a different account", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: null,
        jwtEmbedded: false,
        isPasskeyWalletId: true,
        rememberedAddress: ADDR_A,
        passkeyRecordAddress: ADDR_B,
      }),
      { userId: null, reason: "invalid_account" },
    );
  });

  it("does not restore a passkey session with no stored address", () => {
    assert.deepEqual(
      reconcilePasskeySession({
        jwtUserId: null,
        jwtEmbedded: false,
        isPasskeyWalletId: true,
        rememberedAddress: null,
        passkeyRecordAddress: ADDR_A,
      }),
      { userId: null, reason: "no_session" },
    );
  });
});

describe("persisted Passkey session storage", () => {
  it("persists a passkey bearer and clears temporary session storage", () => {
    const local = mem();
    const session = mem({ [WALLET_BEARER_KEY]: "old-token" });
    writePersistedWalletSession(
      local,
      { token: "passkey-token", walletId: "passkey", address: ADDR_A },
      session,
    );
    assert.equal(local.data[WALLET_BEARER_KEY], "passkey-token");
    assert.equal(local.data[LAST_WALLET_ID_KEY], "passkey");
    assert.equal(local.data[LAST_WALLET_ADDRESS_KEY], ADDR_A_LC);
    assert.deepEqual(session.data, {});
  });

  it("clears every wallet session key", () => {
    const local = mem({
      [WALLET_BEARER_KEY]: "jwt",
      [LAST_WALLET_ID_KEY]: "passkey",
      [LAST_WALLET_ADDRESS_KEY]: ADDR_A_LC,
    });
    const session = mem({ [WALLET_BEARER_KEY]: "old" });
    clearPersistedWalletSession(local, session);
    assert.deepEqual(local.data, {});
    assert.deepEqual(session.data, {});
  });
});
