import { mediaUrlForId, type NotionSeedImage } from "@/lib/idol-overlay";
import { sceneFieldText, type FlexibleScene } from "@/lib/idol-fields";
import { imagesInNotionBucket, notionImageBucketKey } from "@/lib/notion-bucket";
import type { NotionLibraryImage } from "@/lib/notion-images";
import { isThumbImage } from "./media-app-id.ts";

export type NotionImageMeta = {
  pageId: string;
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

export function scoreImageAgainstQuery(meta: NotionImageMeta, query: string): number {
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
  T extends NotionImageMeta & { pageId: string },
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
    .sort((a, b) => b.score - a.score || a.img.pageId.localeCompare(b.img.pageId))
    .map((row) => row.img);
}

export function seedImageToMeta(img: NotionSeedImage & { prompt?: string }): NotionImageMeta {
  return {
    pageId: img.pageId,
    tokenId: img.tokenId,
    scene: img.scene,
    tags: img.tags,
    prompt: img.prompt ?? "",
    type: img.type,
  };
}

export function libraryImageToMeta(img: NotionLibraryImage): NotionImageMeta {
  return {
    pageId: img.pageId,
    tokenId: img.tokenId,
    scene: img.scene,
    tags: img.tags,
    prompt: img.prompt,
    type: img.type,
  };
}

export function candidatePhotoUrlsForScene(
  images: NotionSeedImage[],
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
  return ranked.slice(0, limit).map((i) => mediaUrlForId(i.pageId));
}

export function describeBucketKey(tokenId: number, sceneId: string): string {
  return notionImageBucketKey(tokenId, sceneId);
}
