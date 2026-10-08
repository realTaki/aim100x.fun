import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  absolutePublicMediaUrl,
  buildErc721TokenMetadata,
  nftMetadataTokenUri,
  parseMetadataTokenKey,
} from "./nft-metadata.ts";
import type { Idol } from "./idols.ts";

function idol(partial: Partial<Idol> = {}): Idol {
  return {
    tokenId: 1,
    isPublic: true,
    subscriberCount: 0,
    receiptsUsdc: 0,
    name: "Natalie100x",
    bio: "up this late for me? stay.",
    personality: "直球、会撩",
    look: "",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: 0,
    avatar: "/api/media/seed%3A1%3Aprofile%3Aavatar",
    covers: ["/api/media/seed%3A1%3Aprofile%3Aone%3Acover"],
    banner: "/api/media/seed%3A1%3Aprofile%3Abanner",
    photos: [],
    scenePhotoUrls: {},
    mediaContentRating: {},
    ...partial,
  };
}

describe("parseMetadataTokenKey", () => {
  it("reads decimal token ids", () => {
    assert.deepEqual(parseMetadataTokenKey("1"), { tokenId: 1 });
    assert.deepEqual(parseMetadataTokenKey(" 4 "), { tokenId: 4 });
    assert.deepEqual(parseMetadataTokenKey("0"), {});
  });

  it("rejects non-numeric keys", () => {
    assert.deepEqual(parseMetadataTokenKey("natalie6x"), {});
  });
});

describe("absolutePublicMediaUrl", () => {
  it("prefixes the collection metadata origin for /api/media paths", () => {
    assert.equal(
      absolutePublicMediaUrl("/api/media/seed%3A1%3Aprofile%3Aavatar"),
      "https://aim100x.fun/api/media/seed%3A1%3Aprofile%3Aavatar",
    );
  });

  it("rejects expiring Notion file URLs", () => {
    assert.equal(
      absolutePublicMediaUrl(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/x?X-Amz-Expires=3600",
      ),
      "",
    );
  });
});

describe("buildErc721TokenMetadata", () => {
  it("returns marketplace JSON from public Neon fields and an R2 media route", () => {
    const json = buildErc721TokenMetadata(idol());
    assert.equal(json.name, "Natalie100x");
    assert.equal(json.description, "up this late for me? stay.");
    assert.equal(json.image, "https://aim100x.fun/api/media/seed%3A1%3Aprofile%3Aavatar");
    assert.equal(json.external_url, "https://aim100x.fun/idol/1");
    assert.equal(json.website, "");
    assert.equal(json.twitter, "");
    assert.equal(nftMetadataTokenUri(1), "https://aim100x.fun/api/metadata/1");
    const isPublic = json.attributes.find((a) => a.trait_type === "Public");
    const persona = json.attributes.find((a) => a.trait_type === "人设");
    const token = json.attributes.find((a) => a.trait_type === "Token ID");
    const slug = json.attributes.find((a) => a.trait_type === "Slug");
    assert.equal(isPublic?.value, "true");
    assert.equal(persona, undefined);
    assert.equal(token?.value, 1);
    assert.equal(slug, undefined);
    assert.equal(json.image.includes("notion") || json.image.includes("amazonaws"), false);
  });

  it("includes optional website and twitter even when empty", () => {
    const empty = buildErc721TokenMetadata(idol());
    assert.equal(empty.website, "");
    assert.equal(empty.twitter, "");
    const filled = buildErc721TokenMetadata(
      idol({ website: "https://natalie.example", twitter: "https://x.com/natalie" }),
    );
    assert.equal(filled.website, "https://natalie.example");
    assert.equal(filled.twitter, "https://x.com/natalie");
    assert.equal(filled.external_url, "https://aim100x.fun/idol/1");
  });

  it("does not put cover/banner ids in image or on-chain-shaped fields", () => {
    const json = buildErc721TokenMetadata(idol());
    assert.equal(json.image.includes("cover"), false);
    assert.equal(json.image.includes("banner"), false);
    assert.equal(
      json.attributes.some((a) => /cover|banner|app id/i.test(String(a.trait_type))),
      false,
    );
  });
});

it("never uses private personality as public metadata fallback", () => {
  assert.equal(
    JSON.stringify(buildErc721TokenMetadata(idol({ bio: "", personality: "SECRET" }))).includes(
      "SECRET",
    ),
    false,
  );
});
