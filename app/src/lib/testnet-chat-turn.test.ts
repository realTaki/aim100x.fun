import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Idol } from "@/lib/idols";
import { buildTestnetChatSystemPrompt, testnetWantImage } from "./testnet-chat-turn.ts";

function natalie(partial: Partial<Idol> = {}): Idol {
  return {
    tokenId: 1,
    isPublic: true,
    subscriberCount: 1,
    receiptsUsdc: 0,
    name: "Natalie100x",
    bio: "up this late for me? stay.",
    personality: "直球、会撩",
    look: "黑发挑染紫",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [{ id: "moonlit", heading: "月光", opening: "今晚月亮很亮。", theme: "阳台月光" }],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: 0,
    avatar: "",
    covers: [],
    banner: "",
    photos: [],
    scenePhotoUrls: {},
    mediaContentRating: {},
    ...partial,
  };
}

describe("testnetWantImage", () => {
  it("treats English and Chinese photo asks as in-app attach turns", () => {
    assert.equal(testnetWantImage("send me a photo"), true);
    assert.equal(testnetWantImage("Send me a picture"), true);
    assert.equal(testnetWantImage("发一张照片"), true);
    assert.equal(testnetWantImage("hey"), false);
  });
});

describe("buildTestnetChatSystemPrompt", () => {
  it("does not tell the idol she cannot send photos when the fan asked for one", () => {
    const prompt = buildTestnetChatSystemPrompt(natalie(), {
      chapterTitle: "月光",
      theme: "阳台月光",
      fan: { username: "Taki" },
      wantImage: true,
    });
    assert.match(prompt, /You are roleplaying as Natalie100x/);
    assert.match(prompt, /photo bubble will be attached/);
    assert.match(prompt, /Do not refuse/);
    assert.equal(prompt.includes("Do not call tools, generate images or voice"), false);
    assert.equal(prompt.includes("You cannot attach photos or voice notes this turn"), false);
    assert.match(prompt, /Current scene "月光": 阳台月光/);
  });

  it("keeps ordinary turns as spoken text only", () => {
    const prompt = buildTestnetChatSystemPrompt(natalie(), {
      chapterTitle: "月光",
      theme: "阳台月光",
      wantImage: false,
    });
    assert.match(prompt, /You cannot attach photos or voice notes this turn/);
    assert.equal(prompt.includes("Do not refuse"), false);
  });
});

describe("sendChat wiring", () => {
  it("paid MiniMax replies restore catalog photo intent and never hardcode wantImage false", () => {
    const src = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
    const fn = src.slice(src.indexOf("export const sendChat"), src.indexOf("export const attachChatImage"));
    assert.match(fn, /buildTestnetChatSystemPrompt/);
    assert.match(fn, /testnetWantImage/);
    assert.match(fn, /wantImage,/);
    assert.doesNotMatch(fn, /Do not call tools, generate images or voice/);
    assert.doesNotMatch(fn, /wantImage:\s*false/);
  });
});

describe("shortcut chips", () => {
  it("routes live choices through MiniMax CN, not blocked mainnet x402", () => {
    const src = readFileSync(new URL("./ai.server.ts", import.meta.url), "utf8");
    const fn = src.slice(
      src.indexOf("export async function suggestChoices"),
      src.indexOf("export async function localizeOpeningTexts"),
    );
    assert.match(fn, /const backend = resolveAiBackend\(\)/);
    assert.doesNotMatch(fn, /resolveUserAiBackend/);
    assert.doesNotMatch(fn, /postPaidAi|BLOCKRUN_CHAT_URL|kind: "x402"/);
  });
});
