import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeBucketKey,
  filterAndRankBucketCandidates,
  sceneMetadataSearchText,
} from "./media-bucket-candidates.ts";

describe("media bucket key", () => {
  it("is token id plus scene id", () => {
    assert.equal(describeBucketKey(1, "late-night"), "1/late-night");
  });
});

describe("filterAndRankBucketCandidates", () => {
  const images = [
    {
      mediaId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tokenId: 1,
      scene: "late-night",
      tags: "late-night, bedroom",
      prompt: "dim lamp, silk robe",
      type: "photo",
    },
    {
      mediaId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      tokenId: 1,
      scene: "profile",
      tags: "avatar",
      prompt: "face portrait",
      type: "face",
    },
    {
      mediaId: "cccccccccccccccccccccccccccccccc",
      tokenId: 2,
      scene: "moonlit",
      tags: "moon",
      prompt: "balcony",
      type: "photo",
    },
    {
      mediaId: "dddddddddddddddddddddddddddddddd",
      tokenId: 1,
      scene: "late-night",
      tags: "thumb",
      prompt: "cover album thumb",
      type: "photo",
    },
  ];

  it("keeps only the matching token/scene bucket", () => {
    const ranked = filterAndRankBucketCandidates(
      images,
      1,
      "late-night",
      sceneMetadataSearchText({ theme: "bedroom lamp", title: "深夜" }),
    );
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0]?.scene, "late-night");
    assert.equal(ranked[0]?.mediaId, images[0]?.mediaId);
  });
});
