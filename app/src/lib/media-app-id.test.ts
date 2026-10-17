import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dashedMediaId,
  isMediaId,
  isThumbImage,
  normalizeMediaId,
  stripMediaSizeParam,
} from "./media-app-id.ts";

describe("media ids", () => {
  it("normalizes dashed media ids for /api/media", () => {
    assert.equal(isMediaId("3de440f9-f3b7-8157-b4aa-d1dcafcd5e78"), true);
    assert.equal(isMediaId("3de440f9f3b78157b4aad1dcafcd5e78"), true);
    assert.equal(isMediaId("seed:1:profile:cover"), false);
    assert.equal(
      normalizeMediaId("3de440f9-f3b7-8157-b4aa-d1dcafcd5e78"),
      "3de440f9f3b78157b4aad1dcafcd5e78",
    );
    assert.equal(
      dashedMediaId("3de440f9f3b78157b4aad1dcafcd5e78"),
      "3de440f9-f3b7-8157-b4aa-d1dcafcd5e78",
    );
  });

  it("treats leftover tags=thumb rows as junk, not product pages", () => {
    assert.equal(isThumbImage({ tags: "late-night" }), false);
    assert.equal(isThumbImage({ tags: "thumb" }), true);
    assert.equal(isThumbImage({ tags: "photo, thumb" }), true);
  });

  it("strips size=thumb from media URLs", () => {
    assert.equal(
      stripMediaSizeParam("/api/media/3de440f9f3b78157b4aad1dcafcd5e78?size=thumb"),
      "/api/media/3de440f9f3b78157b4aad1dcafcd5e78",
    );
  });
});
