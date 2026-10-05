import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HUB_DESKTOP_MIN_HEIGHT,
  HUB_DESKTOP_MIN_WIDTH,
  HUB_DESKTOP_MQ,
  HUB_DESKTOP_POINTER_MQ,
  HUB_DESKTOP_SIZE_MQ,
  HUB_STRIP_ASPECT,
  HUB_STRIP_HEIGHT,
  HUB_STRIP_STYLE,
  HUB_STRIP_WIDTH,
  hubStripWidthForHeight,
  hubViewportMode,
  isHubDesktopViewport,
  isHubTabPath,
  isManagerIdolEditorPath,
  measureHubFrame,
  pageOwnsHubHeader,
  shouldLockAppViewport,
} from "./hub-viewport.ts";

describe("hub viewport paths", () => {
  it("locks hub tabs and the broker idol editor", () => {
    assert.equal(isHubTabPath("/"), true);
    assert.equal(isHubTabPath("/me/manager"), true);
    assert.equal(isHubTabPath("/me/manager/"), true);
    assert.equal(isManagerIdolEditorPath("/me/manager"), false);
    assert.equal(isManagerIdolEditorPath("/me/manager/7"), true);
    assert.equal(isManagerIdolEditorPath("/me/manager/7/advanced"), true);
    assert.equal(isManagerIdolEditorPath("/me/manager/7/advanced/"), true);
    assert.equal(isManagerIdolEditorPath("/me/manager/agent"), true);
    assert.equal(isManagerIdolEditorPath("/idol/7"), false);
    assert.equal(shouldLockAppViewport("/"), true);
    assert.equal(shouldLockAppViewport("/me/manager/7"), true);
    assert.equal(shouldLockAppViewport("/me/manager/7/advanced"), true);
    assert.equal(shouldLockAppViewport("/chat/7"), false);
    assert.equal(pageOwnsHubHeader("/"), true);
    assert.equal(pageOwnsHubHeader("/me/manager"), true);
    assert.equal(pageOwnsHubHeader("/me/manager/"), true);
    assert.equal(pageOwnsHubHeader("/subscribed"), false);
    assert.equal(pageOwnsHubHeader("/me"), false);
  });
});

describe("hub viewport aspect", () => {
  it("uses canonical 19.5:9 and desktop media queries", () => {
    assert.equal(HUB_STRIP_WIDTH, 9);
    assert.equal(HUB_STRIP_HEIGHT, 19.5);
    assert.equal(HUB_STRIP_ASPECT, 9 / 19.5);
    assert.equal(HUB_STRIP_STYLE["--lf-strip-w"], "9");
    assert.equal(HUB_STRIP_STYLE["--lf-strip-h"], "19.5");
    assert.equal(HUB_DESKTOP_MIN_WIDTH, 700);
    assert.equal(HUB_DESKTOP_MIN_HEIGHT, 500);
    assert.equal(HUB_DESKTOP_POINTER_MQ, "(hover: hover) and (pointer: fine)");
    assert.equal(HUB_DESKTOP_SIZE_MQ, "(min-width: 700px) and (min-height: 500px)");
    assert.equal(HUB_DESKTOP_MQ, `${HUB_DESKTOP_POINTER_MQ}, ${HUB_DESKTOP_SIZE_MQ}`);
  });

  it("fits phones to the screen aspect, including landscape", () => {
    const se = measureHubFrame({
      viewportWidth: 375,
      viewportHeight: 667,
      desktopPointer: false,
    });
    assert.equal(se.mode, "phone");
    assert.equal(se.width, 375);
    assert.equal(se.height, 667);

    const pro = measureHubFrame({
      viewportWidth: 390,
      viewportHeight: 844,
      desktopPointer: false,
    });
    assert.equal(pro.width, 390);
    assert.equal(pro.height, 844);

    const landscapeInput = {
      viewportWidth: 844,
      viewportHeight: 390,
      desktopPointer: false,
    };
    const landscape = measureHubFrame(landscapeInput);
    assert.equal(isHubDesktopViewport(landscapeInput), false);
    assert.equal(landscape.mode, "phone");
    assert.equal(landscape.width, 844);
    assert.equal(landscape.height, 390);
  });

  it("scales the desktop strip by height at 19.5:9", () => {
    const fullHd = measureHubFrame({
      viewportWidth: 1920,
      viewportHeight: 1080,
      desktopPointer: true,
    });
    assert.equal(fullHd.mode, "desktop");
    assert.equal(fullHd.height, 1080);
    assert.equal(fullHd.width, hubStripWidthForHeight(1080));
    assert.ok(Math.abs(fullHd.width - 498.4615384615) < 1e-6);
    assert.ok(Math.abs(fullHd.width / fullHd.height - 9 / 19.5) < 1e-10);

    const shortWide = measureHubFrame({
      viewportWidth: 1920,
      viewportHeight: 800,
      desktopPointer: true,
    });
    assert.equal(shortWide.height, 800);
    assert.equal(shortWide.width, hubStripWidthForHeight(800));
    assert.ok(shortWide.width < 1920);
    assert.ok(Math.abs(shortWide.width / shortWide.height - 9 / 19.5) < 1e-10);
  });

  it("still uses the 19.5:9 strip on a large touch desktop", () => {
    const touchInput = {
      viewportWidth: 1920,
      viewportHeight: 1200,
      desktopPointer: false,
    };
    const touch = measureHubFrame(touchInput);
    assert.equal(hubViewportMode(touchInput), "desktop");
    assert.equal(touch.mode, "desktop");
    assert.equal(touch.height, 1200);
    assert.equal(touch.width, hubStripWidthForHeight(1200));
  });

  it("does not letterbox a short wide rectangle when the window is narrower than 19.5:9", () => {
    const narrow = measureHubFrame({
      viewportWidth: 300,
      viewportHeight: 800,
      desktopPointer: true,
    });
    assert.equal(narrow.mode, "desktop");
    assert.equal(narrow.height, 800);
    assert.equal(narrow.width, 300);
    assert.ok(hubStripWidthForHeight(800) > 300);
  });
});
