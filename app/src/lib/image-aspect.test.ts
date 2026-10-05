import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AVATAR_ASPECT,
  AVATAR_SIZE,
  BANNER_ASPECT,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  COVER_HEIGHT,
  COVER_POOL_ASPECT,
  COVER_WIDTH,
  aspectForSlot,
  cropRectForAspect,
  longEdgeForSlot,
  pixelsForSlot,
  slotAspectLabel,
  slotWritesThumbnail,
  typeWritesThumbnail,
} from "./image-aspect.ts";

describe("slot aspect ratios", () => {
  it("locks avatar 1:1 1408, banner 16:9 1792×1008, cover/pool 2:3 1152×1728", () => {
    assert.equal(aspectForSlot("avatar"), AVATAR_ASPECT);
    assert.equal(aspectForSlot("banner"), BANNER_ASPECT);
    assert.equal(aspectForSlot("cover"), COVER_POOL_ASPECT);
    assert.equal(AVATAR_ASPECT, 1);
    assert.equal(BANNER_ASPECT, 16 / 9);
    assert.equal(COVER_POOL_ASPECT, 2 / 3);
    assert.equal(AVATAR_SIZE, 1408);
    assert.equal(BANNER_WIDTH, 1792);
    assert.equal(BANNER_HEIGHT, 1008);
    assert.equal(COVER_WIDTH, 1152);
    assert.equal(COVER_HEIGHT, 1728);
    assert.equal(longEdgeForSlot("avatar"), 1408);
    assert.equal(longEdgeForSlot("banner"), 1792);
    assert.equal(longEdgeForSlot("cover"), 1728);
    assert.deepEqual(pixelsForSlot("cover"), { width: 1152, height: 1728 });
    assert.deepEqual(pixelsForSlot("avatar"), { width: 1408, height: 1408 });
    assert.deepEqual(pixelsForSlot("banner"), { width: 1792, height: 1008 });
    assert.equal(slotAspectLabel("cover"), "2:3");
    assert.equal(slotAspectLabel("avatar"), "1:1");
    assert.equal(slotAspectLabel("banner"), "16:9");
  });

  it("writes Thumbnail for every slot and Type", () => {
    assert.equal(slotWritesThumbnail("avatar"), true);
    assert.equal(slotWritesThumbnail("cover"), true);
    assert.equal(slotWritesThumbnail("banner"), true);
    assert.equal(typeWritesThumbnail("face"), true);
    assert.equal(typeWritesThumbnail("cover"), true);
    assert.equal(typeWritesThumbnail("banner"), true);
    assert.equal(typeWritesThumbnail("photo"), true);
    assert.equal(typeWritesThumbnail("generated"), true);
  });

  it("center-crops without stretching", () => {
    const wide = cropRectForAspect(1600, 900, 2 / 3);
    assert.ok(Math.abs(wide.sw / wide.sh - 2 / 3) < 1e-6);
    assert.equal(wide.sh, 900);
    const tall = cropRectForAspect(640, 960, 1);
    assert.ok(Math.abs(tall.sw / tall.sh - 1) < 1e-6);
    assert.equal(tall.sw, 640);
    const banner = cropRectForAspect(1920, 1080, 16 / 9);
    assert.ok(Math.abs(banner.sw / banner.sh - 16 / 9) < 1e-6);
  });
});
