import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildIdolFromChainAndImages } from "./idol-onchain.ts";
import type { FlexibleScene } from "./idols.ts";
import type { MediaSeedImage } from "./idol-overlay.ts";

type ChainToken = {
  tokenId: number;
  name: string;
  bio: string;
  personality: string;
  look: string;
  voice: string;
  website: string;
  twitter: string;
  welcome: string;
  scenes: FlexibleScene[];
  subscribePriceUsdc: number;
  imageUnlockPriceUsdc: number;
  salePriceUsdc: number;
  isPublic: boolean;
  subscriberCount: number;
  receiptsUsdc: number;
  owner: `0x${string}` | null;
};

function token(partial: Partial<ChainToken> = {}): ChainToken {
  return {
    tokenId: 1,
    name: "Natalie100x",
    bio: "hi",
    personality: "",
    look: "",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [{ id: "late-night", opening: "hey" }],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: 0,
    isPublic: false,
    subscriberCount: 0,
    receiptsUsdc: 0,
    owner: "0xe541ba52e2eff4fec12441c77f73352d885e183a",
    ...partial,
  };
}

describe("buildIdolFromChainAndImages", () => {
  const images: MediaSeedImage[] = [
    {
      mediaId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tokenId: 1,
      scene: "late-night",
      tags: "late-night",
      type: "photo",
    },
  ];

  it("merges named chain fields with media bucket photos", () => {
    const idol = buildIdolFromChainAndImages(token(), images);
    assert.equal(idol.name, "Natalie100x");
    assert.equal(idol.isPublic, false);
    assert.deepEqual(idol.covers, []);
    assert.equal(idol.scenePhotoUrls["late-night"]?.length, 1);
    assert.equal(
      idol.scenePhotoUrls["late-night"]?.[0],
      "/api/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    assert.equal(idol.mediaContentRating[idol.scenePhotoUrls["late-night"]![0]!], "SFW");
  });

  it("cover album is every matching cover row, not a single hero", () => {
    const profileImages: MediaSeedImage[] = [
      {
        mediaId: "11111111111111111111111111111111",
        tokenId: 1,
        scene: "profile",
        tags: "avatar",
        type: "face",
      },
      {
        mediaId: "22222222222222222222222222222222",
        tokenId: 1,
        scene: "profile",
        tags: "cover",
        type: "cover",
        lastEdited: "2026-09-18T01:00:00.000Z",
      },
      {
        mediaId: "33333333333333333333333333333333",
        tokenId: 1,
        scene: "profile",
        tags: "cover",
        type: "cover",
        lastEdited: "2026-09-18T02:00:00.000Z",
      },
      {
        mediaId: "44444444444444444444444444444444",
        tokenId: 1,
        scene: "profile",
        tags: "banner",
        type: "banner",
      },
    ];
    const idol = buildIdolFromChainAndImages(
      token({ isPublic: true, scenes: [] }),
      profileImages,
    );
    assert.equal(idol.avatar, "/api/media/11111111111111111111111111111111");
    assert.equal(idol.banner, "/api/media/44444444444444444444444444444444");
    assert.equal(idol.covers.length, 2);
    assert.equal(idol.covers[0], "/api/media/33333333333333333333333333333333");
    assert.equal(idol.covers[1], "/api/media/22222222222222222222222222222222");
  });

  it("includes Type=cover scene rows", () => {
    const idol = buildIdolFromChainAndImages(
      token({ isPublic: true }),
      [
        {
          mediaId: "cccccccccccccccccccccccccccccccc",
          tokenId: 1,
          scene: "late-night",
          tags: "late-night",
          type: "cover",
        },
      ],
    );
    assert.equal(idol.covers.length, 1);
    assert.equal(idol.covers[0], "/api/media/cccccccccccccccccccccccccccccccc");
  });
});
