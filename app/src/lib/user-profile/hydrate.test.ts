import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldHydrateProfileForm } from "./hydrate.ts";
import { EMPTY_USER_PROFILE, profileIsFilled, profileWithSeededLocale, profileWithSeededUsername } from "./local.ts";

describe("shouldHydrateProfileForm", () => {
  it("hydrates on first apply even when empty draft looks dirty", () => {
    assert.equal(
      shouldHydrateProfileForm({
        applied: null,
        profileKey: "u1\0Taki\0\0",
        isDirty: true,
        formMatchesLastApply: false,
      }),
      true,
    );
  });

  it("does not clobber in-progress edits", () => {
    assert.equal(
      shouldHydrateProfileForm({
        applied: { key: "old" },
        profileKey: "new",
        isDirty: true,
        formMatchesLastApply: false,
      }),
      false,
    );
  });

  it("applies a stored profile after a clean save", () => {
    assert.equal(
      shouldHydrateProfileForm({
        applied: { key: "old" },
        profileKey: "new",
        isDirty: false,
        formMatchesLastApply: false,
      }),
      true,
    );
  });
});

describe("profileWithSeededUsername", () => {
  it("fills an empty profile from the signup name", () => {
    assert.deepEqual(profileWithSeededUsername(EMPTY_USER_PROFILE, "  Taki  "), {
      username: "Taki",
      bio: "",
      customAvatar: null,
      locale: "",
    });
  });

  it("does not overwrite a name the fan already saved", () => {
    assert.equal(
      profileWithSeededUsername({ ...EMPTY_USER_PROFILE, username: "Eve" }, "Taki"),
      null,
    );
  });

  it("treats a named profile as filled", () => {
    assert.equal(profileIsFilled(EMPTY_USER_PROFILE), false);
    assert.equal(profileIsFilled({ ...EMPTY_USER_PROFILE, username: "Taki" }), true);
  });
});

describe("profileWithSeededLocale", () => {
  it("fills an empty locale once", () => {
    assert.deepEqual(profileWithSeededLocale(EMPTY_USER_PROFILE, "zh-CN"), {
      ...EMPTY_USER_PROFILE,
      locale: "zh-CN",
    });
  });

  it("does not overwrite a stored locale", () => {
    assert.equal(
      profileWithSeededLocale({ ...EMPTY_USER_PROFILE, locale: "en" }, "zh-CN"),
      null,
    );
  });
});
