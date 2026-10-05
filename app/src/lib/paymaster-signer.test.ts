import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPaymasterSigner } from "./paymaster-signer.ts";

const HEX64 = "11".repeat(32);

describe("readPaymasterSigner", () => {
  it("prefers PAYMASTER_SIGNER", () => {
    assert.equal(
      readPaymasterSigner({
        PAYMASTER_SIGNER: `0x${HEX64}`,
        GROKBOT_WEB3_WALLET: `0x${"22".repeat(32)}`,
      }),
      `0x${HEX64}`,
    );
  });

  it("uses GROKBOT_WEB3_WALLET when the canonical name is unset", () => {
    assert.equal(
      readPaymasterSigner({
        GROKBOT_WEB3_WALLET: HEX64,
      }),
      `0x${HEX64}`,
    );
  });

  it("does not read leftover FACILITATOR / X402 names", () => {
    assert.throws(
      () =>
        readPaymasterSigner({
          FACILITATOR_PRIVATE_KEY: `0x${HEX64}`,
          X402_FACILITATOR_PRIVATE_KEY: `0x${HEX64}`,
        }),
      /PAYMASTER_SIGNER is not configured/,
    );
  });

  it("throws the new name when nothing is set", () => {
    assert.throws(() => readPaymasterSigner({}), /PAYMASTER_SIGNER is not configured/);
  });
});
