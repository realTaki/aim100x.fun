import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localAccountLookupKeys } from "./user-key.ts";

describe("localAccountLookupKeys", () => {
  it("puts the passkey credential first so two passkeys on one device stay separate", () => {
    assert.deepEqual(
      localAccountLookupKeys({
        credentialId: "cred-a",
        wallet: "0xAAAAbac003026f5adf51760ca850ad66750e90ad",
        userId: "0xaaaabac003026f5adf51760ca850ad66750e90ad",
      }),
      [
        "pk:cred-a",
        "0xaaaabac003026f5adf51760ca850ad66750e90ad",
      ],
    );
  });

  it("falls back to the wallet when no passkey is stored yet", () => {
    assert.deepEqual(
      localAccountLookupKeys({
        wallet: "0xAAAAbac003026f5adf51760ca850ad66750e90ad",
        userId: "0xaaaabac003026f5adf51760ca850ad66750e90ad",
      }),
      ["0xaaaabac003026f5adf51760ca850ad66750e90ad"],
    );
  });
});
