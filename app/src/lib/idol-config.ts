import type { Idol, FlexibleScene } from "./idols.ts";
import { sceneId, sceneTopic, sceneOpening, sceneChoices } from "./idol-fields.ts";

export type IdolConfig = Pick<
  Idol,
  | "name"
  | "bio"
  | "personality"
  | "look"
  | "voice"
  | "website"
  | "twitter"
  | "welcome"
  | "scenes"
  | "isPublic"
>;
const textFields = [
  "name",
  "bio",
  "personality",
  "look",
  "voice",
  "website",
  "twitter",
  "welcome",
] as const;
export function parseIdolConfig(input: unknown): IdolConfig {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid idol configuration");
  const value = input as Record<string, unknown>;
  const output = {} as IdolConfig;
  for (const field of textFields) {
    if (typeof value[field] !== "string" || value[field].length > 30_000)
      throw new Error(`Invalid ${field}`);
    output[field] = value[field];
  }
  if (
    typeof value.isPublic !== "boolean" ||
    !Array.isArray(value.scenes) ||
    value.scenes.length > 100
  )
    throw new Error("Invalid scenes or visibility");
  if (value.scenes.some((scene) => !scene || typeof scene !== "object" || Array.isArray(scene)))
    throw new Error("Invalid scene");
  if (JSON.stringify(value.scenes).length > 200_000) throw new Error("Scenes too large");
  output.scenes = value.scenes as FlexibleScene[];
  output.isPublic = value.isPublic;
  return output;
}
export function emptyIdolConfig(tokenId: number): IdolConfig {
  return {
    name: `#${tokenId}`,
    bio: "",
    personality: "",
    look: "",
    voice: "",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [],
    isPublic: false,
  };
}
/** Explicit allowlist: private prompts must never reach public catalog responses. */
export function publicIdol(idol: Idol): Idol {
  return {
    tokenId: idol.tokenId,
    name: idol.name,
    bio: idol.bio,
    website: idol.website,
    twitter: idol.twitter,
    isPublic: idol.isPublic,
    subscriberCount: idol.subscriberCount,
    receiptsUsdc: idol.receiptsUsdc,
    subscribePriceUsdc: idol.subscribePriceUsdc,
    imageUnlockPriceUsdc: idol.imageUnlockPriceUsdc,
    salePriceUsdc: idol.salePriceUsdc,
    avatar: idol.avatar,
    banner: idol.banner,
    covers: idol.covers,
    mediaContentRating: idol.mediaContentRating,
    personality: "",
    look: "",
    voice: "",
    welcome: "",
    scenes: [],
    photos: [],
    scenePhotoUrls: {},
  };
}
/** Subscribers receive display text, never scene settings or author prompt fields. */
export function chatIdol(idol: Idol): Idol {
  return {
    ...publicIdol(idol),
    welcome: idol.welcome,
    voice: idol.voice,
    photos: idol.photos,
    scenePhotoUrls: idol.scenePhotoUrls,
    scenes: idol.scenes.map((scene) => ({
      id: sceneId(scene),
      topic: sceneTopic(scene),
      opening: sceneOpening(scene),
      choices: sceneChoices(scene),
    })),
  };
}
