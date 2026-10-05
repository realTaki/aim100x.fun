import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  imageIdFromUrl,
  mergeLibraryImageRows,
  unusedChatImages,
  type ImageRow,
} from "./library-rows.ts";

function row(id: string, extra: Partial<ImageRow> = {}): ImageRow {
  return {
    id,
    tokenId: 1,
    scene_id: "late-night",
    url: `/api/media/${encodeURIComponent(id)}`,
    prompt: "",
    tags: "late-night",
    source: "seed",
    ...extra,
  };
}

describe("imageIdFromUrl", () => {
  it("reads /api/media page ids including encoded ids", () => {
    assert.equal(imageIdFromUrl("/api/media/abc"), "abc");
    assert.equal(
      imageIdFromUrl("/api/media/3de440f9f3b78157b4aad1dcafcd5e78"),
      "3de440f9f3b78157b4aad1dcafcd5e78",
    );
    assert.equal(
      imageIdFromUrl("/api/media/3de440f9-f3b7-8157-b4aa-d1dcafcd5e78"),
      "3de440f9f3b78157b4aad1dcafcd5e78",
    );
    assert.equal(imageIdFromUrl("/idols/1/avatar.jpg"), undefined);
  });
});

describe("mergeLibraryImageRows", () => {
  it("prefers Notion over leftover DB rows with the same id", () => {
    const merged = mergeLibraryImageRows({
      notion: [row("seed:1:late-night:1.jpg", { prompt: "from-notion" })],
      leftover: [row("seed:1:late-night:1.jpg", { prompt: "from-db" })],
    });
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.prompt, "from-notion");
  });

  it("keeps leftover DB images that are not in Notion", () => {
    const merged = mergeLibraryImageRows({
      notion: [row("gen-notion", { source: "generated" })],
      leftover: [row("old-blob", { source: "generated" })],
    });
    assert.deepEqual(
      merged.map((r) => r.id),
      ["gen-notion", "old-blob"],
    );
  });

  it("stays empty when Notion and leftover are empty", () => {
    const merged = mergeLibraryImageRows({
      notion: [],
      leftover: [],
    });
    assert.deepEqual(merged, []);
  });
});

describe("unusedChatImages", () => {
  it("prefers the current scene, then falls back to the rest of the idol's photos", () => {
    const rows = [
      row("a", { scene_id: "late-night" }),
      row("b", { scene_id: "balcony" }),
      row("c", { scene_id: "balcony" }),
    ];
    assert.deepEqual(
      unusedChatImages(rows, "late-night", new Set()).map((r) => r.id),
      ["a"],
    );
    assert.deepEqual(
      unusedChatImages(rows, "studio", new Set()).map((r) => r.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      unusedChatImages(rows, "late-night", new Set(["a"])).map((r) => r.id),
      ["b", "c"],
    );
  });

  it("treats dashed and compact Notion ids as the same seen photo", () => {
    const dashed = "3de440f9-f3b7-8157-b4aa-d1dcafcd5e78";
    const compact = "3de440f9f3b78157b4aad1dcafcd5e78";
    assert.deepEqual(
      unusedChatImages([row(dashed)], "late-night", new Set([compact])).map((r) => r.id),
      [],
    );
  });
});
