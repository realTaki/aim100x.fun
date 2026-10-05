import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverAlbumItemsFromLibrary } from "./cover-album.ts";
import type { NotionLibraryImage } from "./notion-images.ts";

function row(partial: Partial<NotionLibraryImage> & Pick<NotionLibraryImage, "pageId" | "type">): NotionLibraryImage {
  return {
    tokenId: 1,
    scene: "profile",
    tags: "cover",
    prompt: "",
    contentRating: "SFW",
    ...partial,
  };
}

describe("coverAlbumItemsFromLibrary", () => {
  it("returns Type=cover thumbs in one list, newest first", () => {
    const items = coverAlbumItemsFromLibrary(
      [
        row({
          pageId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          type: "cover",
          lastEdited: "2026-09-18T01:00:00.000Z",
          thumbnailUrl: "https://files.example/a-thumb.jpg",
        }),
        row({
          pageId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          type: "photo",
        }),
        row({
          pageId: "cccccccccccccccccccccccccccccccc",
          type: "cover",
          lastEdited: "2026-09-18T02:00:00.000Z",
        }),
      ],
      1,
    );
    assert.equal(items.length, 2);
    assert.equal(items[0]?.pageId, "cccccccccccccccccccccccccccccccc");
    assert.equal(items[0]?.fullUrl, "/api/media/cccccccccccccccccccccccccccccccc");
    assert.equal(items[0]?.thumbUrl, "/api/media/cccccccccccccccccccccccccccccccc?size=thumb");
    assert.equal(items[1]?.thumbUrl, "https://files.example/a-thumb.jpg");
  });
});
