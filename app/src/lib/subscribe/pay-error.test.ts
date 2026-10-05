import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shortPayError } from "./pay-error.ts";

describe("shortPayError", () => {
  it("is one short line for any input", () => {
    assert.equal(shortPayError(new Error("execution reverted: FacilitatorOnly")), "Pay failed");
    assert.equal(shortPayError("need wallet / for= missing"), "Pay failed");
    assert.equal(shortPayError(null), "Pay failed");
    assert.ok(!shortPayError({}).includes("\n"));
  });

  it("maps balance and cancel failures to short labels", () => {
    assert.equal(
      shortPayError(new Error("ERC20InsufficientBalance")),
      "Low balance",
    );
    assert.equal(
      shortPayError({ shortMessage: "transfer amount exceeds balance" }),
      "Low balance",
    );
    assert.equal(shortPayError(new Error("User rejected the request")), "Canceled");
  });

  it("surfaces AA / paymaster / preVerificationGas instead of Pay failed", () => {
    assert.equal(shortPayError(new Error("AA33 reverted (or OOG)")), "AA33");
    assert.equal(shortPayError(new Error("AA23 reverted (or OOG)")), "AA23");
    assert.equal(
      shortPayError(new Error("AA31 paymaster deposit too low")),
      "Low gas",
    );
    assert.equal(
      shortPayError(
        new Error("preVerificationGas is not enough, required: 2543751, got: 649246"),
      ),
      "Low gas",
    );
  });
});
