import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  idolDisplayStrip,
  pickPoolImages,
  pickProfileAlbumImages,
  profileImageIsPool,
  profileImageMatchesKind,
} from "./profile-album.ts";

describe("profileImageMatchesKind", () => {
  const base = {
    mediaId: "p1",
    scene: "profile",
    tags: "",
    type: "face",
    tokenId: 1,
  };

  it("matches avatar and banner by Type only", () => {
    assert.equal(profileImageMatchesKind(base, "avatar"), true);
    assert.equal(profileImageMatchesKind({ ...base, type: "photo" }, "avatar"), false);
    assert.equal(profileImageMatchesKind({ ...base, type: "banner" }, "banner"), true);
  });

  it("does not reuse mixed Type/tags as banner", () => {
    const mixed = {
      ...base,
      type: "cover",
      tags: "banner",
    };
    assert.equal(profileImageMatchesKind(mixed, "banner"), false);
    assert.equal(profileImageMatchesKind(mixed, "cover"), true);
  });

  it("cover album is every Type=cover row for the token, including named scenes", () => {
    const a = {
      ...base,
      mediaId: "c1",
      type: "cover",
      tags: "cover",
      lastEdited: "2026-09-18T01:00:00.000Z",
    };
    const b = {
      ...base,
      mediaId: "c2",
      scene: "late-night",
      type: "cover",
      tags: "late-night",
      lastEdited: "2026-09-18T02:00:00.000Z",
    };
    const photo = {
      ...base,
      mediaId: "p2",
      scene: "late-night",
      type: "photo",
      tags: "late-night",
    };
    const junk = {
      ...base,
      mediaId: "t1",
      type: "photo",
      tags: "thumb",
    };
    const album = pickProfileAlbumImages([a, b, photo, junk], 1, "cover");
    assert.deepEqual(
      album.map((row) => row.mediaId),
      ["c2", "c1"],
    );
    assert.equal(profileImageIsPool(photo), true);
    assert.equal(profileImageIsPool(a), false);
    assert.equal(profileImageIsPool(junk), false);
    assert.equal(pickPoolImages([a, b, photo, junk], 1).map((r) => r.mediaId).join(), "p2");
  });

  it("fan strip prefers Type=banner, else first album cover", () => {
    assert.deepEqual(idolDisplayStrip({ banner: "/b", covers: ["/c1", "/c2"] }), {
      src: "/b",
      isAlbumCover: false,
    });
    assert.deepEqual(idolDisplayStrip({ banner: "", covers: ["/c1", "/c2"] }), {
      src: "/c1",
      isAlbumCover: true,
    });
    assert.deepEqual(idolDisplayStrip({ banner: "  ", covers: ["", " /c2 "] }), {
      src: "/c2",
      isAlbumCover: true,
    });
    assert.deepEqual(idolDisplayStrip({ banner: "", covers: [] }), {
      src: "",
      isAlbumCover: false,
    });
  });

  it("unflagged pool images are not album rows", () => {
    const pool = {
      mediaId: "g1",
      scene: "late-night",
      tags: "late-night",
      type: "generated",
      tokenId: 1,
    };
    assert.equal(profileImageIsPool(pool), true);
    assert.equal(profileImageMatchesKind(pool, "cover"), false);
    assert.equal(
      profileImageMatchesKind({ ...pool, type: "photo", tags: "thumb" }, "cover"),
      false,
    );
  });
});
