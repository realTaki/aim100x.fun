import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendPinDigit,
  cookieIndicatesWelcomeEntered,
  pickWelcomeCover,
  shouldRedirectRootToWelcome,
  swipeProgress,
  swipeUnlocked,
  welcomeCoverPool,
  WELCOME_ENTERED_COOKIE,
  WELCOME_ENTERED_VALUE,
  WELCOME_PATH,
  WELCOME_PIN_LENGTH,
} from "./welcome-entry.ts";

describe("welcome entry", () => {
  it("sends first visits to /welcome", () => {
    assert.equal(WELCOME_PATH, "/welcome");
    assert.equal(shouldRedirectRootToWelcome(false), true);
    assert.equal(shouldRedirectRootToWelcome(true), false);
  });

  it("reads the session cookie", () => {
    assert.equal(cookieIndicatesWelcomeEntered(""), false);
    assert.equal(cookieIndicatesWelcomeEntered("other=1"), false);
    assert.equal(
      cookieIndicatesWelcomeEntered(`${WELCOME_ENTERED_COOKIE}=${WELCOME_ENTERED_VALUE}`),
      true,
    );
    assert.equal(
      cookieIndicatesWelcomeEntered(`a=b; ${WELCOME_ENTERED_COOKIE}=${WELCOME_ENTERED_VALUE}; c=d`),
      true,
    );
    assert.equal(cookieIndicatesWelcomeEntered(`${WELCOME_ENTERED_COOKIE}=0`), false);
  });

  it("pools unique idol cover photos, not banners or avatars", () => {
    assert.deepEqual(
      welcomeCoverPool([{ covers: ["", " /c1 ", "/c2"] }, { covers: ["/c1", "/c3"] }]),
      ["/c1", "/c2", "/c3"],
    );
    assert.deepEqual(welcomeCoverPool([{ covers: [] }]), []);
  });

  it("picks a cover at random and does not invent one", () => {
    assert.equal(pickWelcomeCover([]), "");
    assert.equal(
      pickWelcomeCover(["/a", "/b", "/c"], () => 0),
      "/a",
    );
    assert.equal(
      pickWelcomeCover(["/a", "/b", "/c"], () => 0.99),
      "/c",
    );
  });
});

describe("swipe unlock", () => {
  it("maps drag distance onto 0–1", () => {
    assert.equal(swipeProgress(0, 200), 0);
    assert.equal(swipeProgress(100, 200), 0.5);
    assert.equal(swipeProgress(200, 200), 1);
    assert.equal(swipeProgress(400, 200), 1);
    assert.equal(swipeProgress(-20, 200), 0);
    assert.equal(swipeProgress(10, 0), 0);
  });

  it("unlocks past the threshold or on a flick", () => {
    assert.equal(swipeUnlocked(100, 200), false);
    assert.equal(swipeUnlocked(144, 200), true);
    assert.equal(swipeUnlocked(70, 200, 0.9), true);
    assert.equal(swipeUnlocked(20, 200, 2), false);
  });
});

describe("welcome pin entry", () => {
  it("accepts digits up to six without a shared preset PIN", () => {
    assert.equal(WELCOME_PIN_LENGTH, 6);
    assert.equal(appendPinDigit("", "9"), "9");
    assert.equal(appendPinDigit("12345", "6"), "123456");
    assert.equal(appendPinDigit("123456", "7"), "123456");
    assert.equal(appendPinDigit("99", "a"), "99");
  });
});
