import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchSeedImage, mediaUrlForId, type NotionSeedImage } from "./idol-overlay.ts";

describe("mediaUrlForId", () => {
  it("encodes a compact Notion page id", () => {
    assert.equal(
      mediaUrlForId("3de440f9-f3b7-8157-b4aa-d1dcafcd5e78"),
      "/api/media/3de440f9f3b78157b4aad1dcafcd5e78",
    );
  });
});

describe("matchSeedImage", () => {
  const images: NotionSeedImage[] = [
    {
      pageId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tokenId: 1,
      scene: "late-night",
      tags: "late-night, seed",
      type: "photo",
    },
    {
      pageId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      tokenId: 1,
      scene: "profile",
      tags: "avatar",
      type: "face",
    },
  ];

  it("maps local avatar/cover stems to Type, and scene stems to Scene", () => {
    assert.equal(matchSeedImage(images, 1, "/idols/natalie/avatar.jpg")?.type, "face");
    assert.equal(matchSeedImage(images, 1, "/idols/natalie/late-night.jpg")?.pageId, images[0]?.pageId);
  });
});
