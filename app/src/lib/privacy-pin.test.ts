import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  createPrivacyPin,
  hasPrivacyPin,
  privacyPinFailures,
  resetPrivacyPinFailures,
  verifyPrivacyPin,
} from "./privacy-pin.ts";

function memoryStorage(data: Map<string, string>): Storage {
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function installStorage(t: TestContext, data: Map<string, string>): void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage(data),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
}

describe("device privacy PIN", () => {
  it("stores only a salted hash, isolates accounts and signs out on the third failure across retries", async (t) => {
    const data = new Map<string, string>();
    installStorage(t, data);
    assert.equal(hasPrivacyPin("alice"), false);
    await createPrivacyPin("alice", "123456");
    await createPrivacyPin("bob", "123456");
    assert.equal(hasPrivacyPin("alice"), true);
    assert.equal(
      [...data.values()].some((value) => value.includes("123456")),
      false,
    );
    assert.notEqual(
      JSON.parse(data.get("aim-privacy-pin-v1:alice")!).hash,
      JSON.parse(data.get("aim-privacy-pin-v1:bob")!).hash,
    );
    await assert.rejects(createPrivacyPin("alice", "654321"));
    assert.equal(await verifyPrivacyPin("alice", "000000"), "wrong");
    assert.equal(privacyPinFailures("alice"), 1);
    assert.equal(await verifyPrivacyPin("alice", "123456"), "ok");
    assert.equal(privacyPinFailures("alice"), 0);
    assert.equal(await verifyPrivacyPin("alice", "000000"), "wrong");
    assert.equal(await verifyPrivacyPin("alice", "000000"), "wrong");
    assert.equal(await verifyPrivacyPin("alice", "000000"), "sign-out");
    assert.equal(await verifyPrivacyPin("alice", "123456"), "sign-out");
    assert.equal(privacyPinFailures("bob"), 0);
    resetPrivacyPinFailures("alice");
    assert.equal(await verifyPrivacyPin("alice", "123456"), "ok");
  });

  it("rejects malformed PINs and refuses to treat damaged storage as first-time setup", async (t) => {
    const data = new Map<string, string>();
    installStorage(t, data);
    await assert.rejects(createPrivacyPin("alice", "12345"));
    await assert.rejects(createPrivacyPin("alice", "abcdef"));
    data.set("aim-privacy-pin-v1:alice", "{}");
    assert.throws(() => hasPrivacyPin("alice"));
  });
});
