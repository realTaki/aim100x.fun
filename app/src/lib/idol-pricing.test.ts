import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_IDOL_PRICE_USDC,
  atomicAmountToUsdc,
  formatReceiptsAmount,
  formatSalePrice,
  formatUsdcPrice,
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
  salePriceDraft,
  usdcToAtomicOrZero,
  usdcToAtomicString,
} from "./idol-pricing.ts";
import type { Idol } from "./idols.ts";

function idol(partial: Partial<Idol> = {}): Idol {
  return {
    tokenId: 1,
    isPublic: false,
    subscriberCount: 0,
    receiptsUsdc: 0,
    name: "Natalie100x",
    bio: "",
    personality: "",
    look: "",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [],
    subscribePriceUsdc: 0,
    imageUnlockPriceUsdc: 0,
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

describe("idol-pricing", () => {
  it("defaults both prices to 1 USDC", () => {
    assert.equal(idolSubscribePriceUsdc(idol()), DEFAULT_IDOL_PRICE_USDC);
    assert.equal(idolImageUnlockPriceUsdc(idol()), DEFAULT_IDOL_PRICE_USDC);
    assert.equal(usdcToAtomicString(DEFAULT_IDOL_PRICE_USDC), "1000000");
  });

  it("reads named price fields", () => {
    const priced = idol({ subscribePriceUsdc: 2, imageUnlockPriceUsdc: 0.5 });
    assert.equal(idolSubscribePriceUsdc(priced), 2);
    assert.equal(idolImageUnlockPriceUsdc(priced), 0.5);
    assert.equal(formatUsdcPrice(2), "2 LUSD");
  });

  it("formats zero receipts without defaulting to 1 USDC", () => {
    assert.equal(atomicAmountToUsdc(0), 0);
    assert.equal(atomicAmountToUsdc(1_000_000), 1);
    assert.equal(formatReceiptsAmount(0), "0");
    assert.equal(formatReceiptsAmount(2), "2");
    assert.equal(formatReceiptsAmount(2.5), "2.50");
  });

  it("encodes a zero sale price as 0 atomic", () => {
    assert.equal(usdcToAtomicOrZero(0), 0n);
    assert.equal(usdcToAtomicOrZero(2), 2_000_000n);
    assert.equal(formatSalePrice(0), "不出售");
    assert.equal(formatSalePrice(20), "20 LUSD");
    assert.equal(salePriceDraft(0), "");
    assert.equal(salePriceDraft(20), "20");
  });
});
