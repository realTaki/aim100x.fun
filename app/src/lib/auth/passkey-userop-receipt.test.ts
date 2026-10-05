import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { userOpReceiptResult } from "./passkey-userop-receipt.ts";

const TX = `0x${"ab".repeat(32)}` as const;

describe("userOpReceiptResult", () => {
  it("is pending until the bundler has a receipt", () => {
    assert.deepEqual(userOpReceiptResult(null), { status: "pending" });
  });

  it("returns the tx hash only after a successful inclusion", () => {
    assert.deepEqual(
      userOpReceiptResult({ success: true, receipt: { transactionHash: TX } }),
      { status: "included", hash: TX },
    );
  });

  it("stays pending when the bundler returns an empty in-flight receipt", () => {
    assert.deepEqual(userOpReceiptResult({}), { status: "pending" });
    assert.deepEqual(userOpReceiptResult({ receipt: {} }), { status: "pending" });
  });

  it("treats revert or a missing hash as failed", () => {
    assert.deepEqual(userOpReceiptResult({ success: false, receipt: { transactionHash: TX } }), {
      status: "reverted",
    });
    assert.deepEqual(
      userOpReceiptResult({
        success: false,
        reason: "AA31 paymaster deposit too low",
        receipt: { transactionHash: TX },
      }),
      { status: "reverted", reason: "AA31 paymaster deposit too low" },
    );
    assert.deepEqual(userOpReceiptResult({ success: true, receipt: { transactionHash: "0x" } }), {
      status: "reverted",
    });
  });
});
