import { mediaUrlForId, type MediaSeedImage } from "@/lib/idol-overlay";
import { sceneFieldText, type FlexibleScene } from "@/lib/idol-fields";
import { imagesInMediaBucket, mediaBucketKey } from "@/lib/media-bucket";
import type { MediaImage } from "@/lib/media-library";
import { isThumbImage } from "./media-app-id.ts";

export type MediaImageMeta = {
  mediaId: string;
  tokenId: number;
  scene: string;
  tags: string;
  prompt: string;
  type: string;
};

/** Scene text from on-chain fields (flexible keys) used to rank bucket images. */
export function sceneMetadataSearchText(scene: FlexibleScene): string {
  const bits: string[] = [];
  for (const value of Object.values(scene)) {
    if (typeof value === "string" && value.trim()) bits.push(value.trim());
  }
  return bits.join(" ");
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2);
  const grams: string[] = [];
  const compact = lower.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i++) {
    grams.push(compact.slice(i, i + 2));
  }
  return [...new Set([...words, ...grams])];
}

export function scoreImageAgainstQuery(meta: MediaImageMeta, query: string): number {
  const hay = `${meta.tags} ${meta.prompt} ${meta.type}`.toLowerCase();
  let score = 0;
  for (const token of tokenize(query)) {
    if (token.length < 2) continue;
    if (hay.includes(token)) score += token.length >= 4 ? 4 : 2;
  }
  if (meta.type === "photo") score += 1;
  return score;
}

export function filterAndRankBucketCandidates<
  T extends MediaImageMeta & { mediaId: string },
>(images: T[], tokenId: number, sceneId: string, query: string): T[] {
  const bucket = images.filter(
    (img) =>
      img.tokenId === tokenId &&
      img.scene.trim() === sceneId.trim() &&
      !isThumbImage(img) &&
      img.type !== "face" &&
      img.type !== "banner",
  );
  if (!query.trim()) {
    return [...bucket].sort(
      (a, b) => scoreImageAgainstQuery(b, sceneId) - scoreImageAgainstQuery(a, sceneId),
    );
  }
  return [...bucket]
    .map((img) => ({ img, score: scoreImageAgainstQuery(img, query) }))
    .sort((a, b) => b.score - a.score || a.img.mediaId.localeCompare(b.img.mediaId))
    .map((row) => row.img);
}

export function seedImageToMeta(img: MediaSeedImage & { prompt?: string }): MediaImageMeta {
  return {
    mediaId: img.mediaId,
    tokenId: img.tokenId,
    scene: img.scene,
    tags: img.tags,
    prompt: img.prompt ?? "",
    type: img.type,
  };
}

export function libraryImageToMeta(img: MediaImage): MediaImageMeta {
  return {
    mediaId: img.mediaId,
    tokenId: img.tokenId,
    scene: img.scene,
    tags: img.tags,
    prompt: img.prompt,
    type: img.type,
  };
}

export function candidatePhotoUrlsForScene(
  images: MediaSeedImage[],
  tokenId: number,
  scene: FlexibleScene,
  limit = 24,
): string[] {
  const sceneId = sceneFieldText(scene, "id", "sceneId") || "chat";
  const query = sceneMetadataSearchText(scene);
  const ranked = filterAndRankBucketCandidates(
    images.map((i) => seedImageToMeta(i)),
    tokenId,
    sceneId,
    query,
  );
  return ranked.slice(0, limit).map((i) => mediaUrlForId(i.mediaId));
}

export function describeBucketKey(tokenId: number, sceneId: string): string {
  return mediaBucketKey(tokenId, sceneId);
}
