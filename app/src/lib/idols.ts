import type { ImageContentRating } from "@/lib/image-content-rating";
import {
  idolScenes,
  sceneAt,
  sceneChoices,
  sceneId,
} from "@/lib/idol-fields";

export { sceneAt };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type FlexibleScene = { [key: string]: JsonValue };

/** Named NFT fields + Notion images. Index is token id only. */
export type Idol = {
  tokenId: number;
  /** Plaza / service visibility (公开). Not the 20 LUSD sale listing. */
  isPublic: boolean;
  subscriberCount: number;
  /** Lifetime USDC received (display units), 累计收账. */
  receiptsUsdc: number;
  name: string;
  bio: string;
  personality: string;
  look: string;
  voice: string;
  /** Optional public site URL. Empty allowed. */
  website: string;
  /** Optional Twitter/X URL. Empty allowed. */
  twitter: string;
  /** 欢迎词. Separate from scene `opening`. Empty allowed. */
  welcome: string;
  scenes: FlexibleScene[];
  /** Display USDC (not 6-decimal atomic). */
  subscribePriceUsdc: number;
  imageUnlockPriceUsdc: number;
  /** Display USDC. 0 = not for sale. */
  salePriceUsdc: number;
  avatar: string;
  covers: string[];
  banner: string;
  photos: string[];
  scenePhotoUrls: Record<string, string[]>;
  mediaContentRating: Record<string, ImageContentRating>;
};

export function sceneOf(idol: Idol, chapter: number): FlexibleScene {
  return sceneAt(idol, chapter);
}

export function sceneIndex(idol: Idol, sceneKey: string) {
  const scenes = idolScenes(idol);
  const i = scenes.findIndex((c) => sceneId(c) === sceneKey);
  return i >= 0 ? i : 0;
}

export function nextScene(idol: Idol, sceneKey: string) {
  const scenes = idolScenes(idol);
  if (scenes.length === 0) return sceneAt(idol, 0);
  const i = sceneIndex(idol, sceneKey);
  return scenes[(i + 1) % scenes.length]!;
}

export { sceneChoices, sceneId };
