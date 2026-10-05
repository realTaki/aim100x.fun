import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isIdolManagerWallet } from "./idol-manager-wallet.ts";

const OWNER = "0xe541ba52e2eff4fec12441c77f73352d885e183a" as const;
const OTHER = "0xa445BaC003026F5aDf51760CA850ad66750e90ad" as const;

describe("isIdolManagerWallet", () => {
  it("matches the ERC-721 owner case-insensitively", () => {
    assert.equal(isIdolManagerWallet(OWNER, OWNER), true);
    assert.equal(isIdolManagerWallet(OWNER, OWNER.toUpperCase() as `0x${string}`), true);
  });

  it("rejects a different connected wallet", () => {
    assert.equal(isIdolManagerWallet(OWNER, OTHER), false);
  });

  it("rejects missing owner or wallet without a lecture state", () => {
    assert.equal(isIdolManagerWallet(null, OWNER), false);
    assert.equal(isIdolManagerWallet(OWNER, null), false);
    assert.equal(isIdolManagerWallet(undefined, undefined), false);
  });
});
