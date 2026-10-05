import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountEmailFor,
  formatAccountLabel,
  normalizeHost,
  requestHostFromHeaders,
} from "./account-host.ts";

describe("account host helpers", () => {
  it("normalizes forwarded and direct request hosts", () => {
    assert.equal(normalizeHost("https://LonelyFuns.vercel.app/login"), "lonelyfuns.vercel.app");
    assert.equal(requestHostFromHeaders(new Headers({ "x-forwarded-host": "example.test, proxy" })), "example.test");
  });

  it("formats the Passkey smart-account address", () => {
    const address = "0xA445BaC003026F5aDf51760CA850ad66750e90ad";
    assert.equal(accountEmailFor(address), `${address.toLowerCase()}@account.lonelyfuns.invalid`);
    assert.equal(formatAccountLabel({ displayName: address }), "0xA445…90ad");
  });
});
