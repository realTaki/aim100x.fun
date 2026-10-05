import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  actionGlyphBadge,
  isActionGlyphBusy,
  runActionGlyph,
  type ActionGlyph,
} from "./action-glyph.ts";

describe("runActionGlyph", () => {
  it("spins then checks then returns to idle", async () => {
    const seen: ActionGlyph[] = [];
    const end = await runActionGlyph(async () => undefined, (s) => seen.push(s), {
      pendingMinMs: 0,
      successHoldMs: 0,
      sleep: async () => undefined,
    });
    assert.equal(end, "idle");
    assert.deepEqual(seen, ["pending", "success", "idle"]);
  });

  it("can stay on done after a pay-style success", async () => {
    const seen: ActionGlyph[] = [];
    const end = await runActionGlyph(async () => undefined, (s) => seen.push(s), {
      afterSuccess: "done",
      pendingMinMs: 0,
      successHoldMs: 0,
      sleep: async () => undefined,
    });
    assert.equal(end, "done");
    assert.deepEqual(seen, ["pending", "success", "done"]);
  });

  it("shows X then idle on failure and reports the message", async () => {
    const seen: ActionGlyph[] = [];
    let reported = "";
    const end = await runActionGlyph(
      async () => {
        throw new Error("gas 不足");
      },
      (s) => seen.push(s),
      {
        pendingMinMs: 0,
        errorHoldMs: 0,
        sleep: async () => undefined,
        onError: (msg) => {
          reported = msg;
        },
      },
    );
    assert.equal(end, "error");
    assert.equal(reported, "gas 不足");
    assert.deepEqual(seen, ["pending", "error", "idle"]);
  });

  it("maps overlay badges and busy", () => {
    assert.equal(actionGlyphBadge("pending"), "pending");
    assert.equal(actionGlyphBadge("success"), "success");
    assert.equal(actionGlyphBadge("error"), "error");
    assert.equal(actionGlyphBadge("idle"), undefined);
    assert.equal(actionGlyphBadge("done"), undefined);
    assert.equal(isActionGlyphBusy("pending"), true);
    assert.equal(isActionGlyphBusy("success"), true);
    assert.equal(isActionGlyphBusy("idle"), false);
    assert.equal(isActionGlyphBusy("error"), false);
  });
});
