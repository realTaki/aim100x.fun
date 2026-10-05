import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { walletAddressFromUserId } from "./idols100x-membership-chain.server.ts";

describe("walletAddressFromUserId", () => {
  it("accepts lowercase Passkey user ids", () => {
    assert.equal(
      walletAddressFromUserId("0x9e2d43c482f26d5cd49ca13f2f1e3d30cacb2103"),
      "0x9e2d43c482f26d5cd49ca13f2f1e3d30cacb2103",
    );
  });

  it("accepts checksummed wallets used by subscribe/私信", () => {
    assert.equal(
      walletAddressFromUserId("0x9e2D43c482F26D5CD49ca13F2F1E3d30CaCb2103"),
      "0x9e2d43c482f26d5cd49ca13f2f1e3d30cacb2103",
    );
  });

  it("rejects passkey session ids and non-wallets so list does not query address(0)", () => {
    assert.equal(walletAddressFromUserId("passkey"), null);
    assert.equal(walletAddressFromUserId("dev-user"), null);
    assert.equal(walletAddressFromUserId(""), null);
  });
});
