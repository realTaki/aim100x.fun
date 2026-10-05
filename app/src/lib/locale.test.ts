import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { localePromptName, localesMatch, normalizeLocale, profileLocaleOptions } from "./locale.ts";

describe("normalizeLocale", () => {
  it("keeps language-region and lowercases the language", () => {
    assert.equal(normalizeLocale("zh-cn"), "zh-CN");
    assert.equal(normalizeLocale("en_US"), "en-US");
    assert.equal(normalizeLocale(" ja "), "ja");
    assert.equal(normalizeLocale(""), "en");
  });
});

describe("localesMatch", () => {
  it("ignores case", () => {
    assert.equal(localesMatch("zh-CN", "zh-cn"), true);
    assert.equal(localesMatch("en", "en-US"), false);
  });
});

describe("localePromptName", () => {
  it("names the language for the model", () => {
    assert.match(localePromptName("zh-CN"), /Chinese/i);
    assert.match(localePromptName("en"), /English/i);
  });
});

describe("profileLocaleOptions", () => {
  it("keeps a stored tag that is not in the preset list", () => {
    const values = profileLocaleOptions("nl-NL").map((row) => row.value);
    assert.equal(values[0], "nl-NL");
    assert.equal(values.includes("zh-CN"), true);
  });
});
