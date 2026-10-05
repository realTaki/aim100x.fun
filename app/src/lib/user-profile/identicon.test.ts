import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identiconDataUrl } from "./identicon.ts";

describe("identiconDataUrl", () => {
  it("is deterministic for the same seed", () => {
    const a = identiconDataUrl("0xabc123");
    const b = identiconDataUrl("0xabc123");
    assert.equal(a, b);
    assert.match(a, /^data:image\/svg\+xml,/);
  });

  it("differs for different seeds", () => {
    assert.notEqual(
      identiconDataUrl("0x0000000000000000000000000000000000000001"),
      identiconDataUrl("0x0000000000000000000000000000000000000002"),
    );
  });
});
