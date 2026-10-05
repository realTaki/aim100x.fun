import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runPayAction, type PayActionStatus } from "./pay-action.ts";

describe("runPayAction", () => {
  it("does not emit success until work resolves", async () => {
    let resolveWork!: () => void;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });
    const seen: PayActionStatus[] = [];
    const done = runPayAction(() => work, (s) => seen.push(s), {
      pendingMinMs: 0,
      successHoldMs: 0,
      sleep: async () => {},
    });
    await Promise.resolve();
    assert.deepEqual(seen, ["pending"]);
    resolveWork();
    assert.equal(await done, "done");
    assert.deepEqual(seen, ["pending", "success", "done"]);
  });

  it("goes pending → success → done on success", async () => {
    const seen: PayActionStatus[] = [];
    const end = await runPayAction(
      async () => {},
      (s) => seen.push(s),
      { pendingMinMs: 0, successHoldMs: 0, sleep: async () => {} },
    );
    assert.equal(end, "done");
    assert.deepEqual(seen, ["pending", "success", "done"]);
  });

  it("shows X then idle when work throws", async () => {
    const seen: PayActionStatus[] = [];
    const end = await runPayAction(
      async () => {
        throw new Error("nope");
      },
      (s) => seen.push(s),
      { pendingMinMs: 0, successHoldMs: 0, sleep: async () => {} },
    );
    assert.equal(end, "error");
    assert.deepEqual(seen, ["pending", "error", "idle"]);
  });
});
