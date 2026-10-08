import assert from "node:assert/strict";
import { it } from "node:test";
import { emptyIdolConfig, parseIdolConfig, publicIdol, chatIdol } from "./idol-config.ts";
import type { Idol } from "./idols.ts";
const source = {
  ...emptyIdolConfig(1),
  tokenId: 1,
  name: "Public name",
  personality: "SECRET_PERSONA",
  look: "SECRET_LOOK",
  welcome: "Welcome",
  scenes: [
    {
      id: "one",
      topic: "Chapter",
      opening: "Hello",
      choices: ["Hi"],
      scene: "SECRET_STORY",
      hidden: "SECRET_EXTRA",
    },
  ],
  avatar: "/api/media/avatar",
  banner: "/api/media/banner",
  covers: [],
  photos: [],
  scenePhotoUrls: {},
  mediaContentRating: {},
  subscriberCount: 0,
  receiptsUsdc: 0,
  subscribePriceUsdc: 1,
  imageUnlockPriceUsdc: 1,
  salePriceUsdc: 0,
  internal: "SECRET_FUTURE_FIELD",
} as Idol;
it("public catalogs allowlist fields and omit all author content", () => {
  const result = publicIdol(source);
  assert.equal(result.name, "Public name");
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.deepEqual(result.scenes, []);
  assert.equal(result.welcome, "");
});
it("subscriber display data includes dialogue without plot or prompt settings", () => {
  const result = chatIdol(source);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
  assert.equal(result.welcome, "Welcome");
  assert.deepEqual(result.scenes, [
    { id: "one", topic: "Chapter", opening: "Hello", choices: ["Hi"] },
  ]);
});
it("configuration accepts flexible story fields, rejects invalid structures, and drops nonconfig data", () => {
  assert.equal(parseIdolConfig(source).scenes[0].scene, "SECRET_STORY");
  assert.equal("internal" in parseIdolConfig(source), false);
  for (const scenes of ["not-json", [null], ["bad"]])
    assert.throws(() => parseIdolConfig({ ...source, scenes }));
  assert.throws(() => parseIdolConfig({ ...source, isPublic: "true" }));
  assert.throws(() => parseIdolConfig({ ...source, personality: "x".repeat(30001) }));
  assert.equal(emptyIdolConfig(8).isPublic, false);
});
