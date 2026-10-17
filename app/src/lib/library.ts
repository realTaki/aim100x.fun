import { sceneId } from "@/lib/idol-fields";
import { type Idol, sceneOf } from "@/lib/idols";
import {
  filterAndRankBucketCandidates,
  libraryImageToMeta,
  sceneMetadataSearchText,
} from "@/lib/media-bucket-candidates";
import { uid } from "@/lib/utils";
import {
  fetchMediaLibrary,
  mediaLibraryConfigured,
  publishIdolImage,
  resolveMediaImageUrl,
  resolveMediaThumbUrl,
  type MediaImage,
} from "@/lib/media-library";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { mediaUrlForId } from "@/lib/idol-overlay";
import { isMediaId, isThumbImage, normalizeMediaId } from "@/lib/media-app-id";
import {
  imageIdFromUrl,
  mergeLibraryImageRows,
  unusedChatImages,
  type ImageRow,
} from "@/lib/library-rows";

export const SCENE_IMAGE_CAP = 100;
export const SCENE_STAY_LIMIT = 20;
export type { ImageRow };
export { imageIdFromUrl, mergeLibraryImageRows };

async function loadIdolCatalog() {
  return (await import("@/lib/idol-catalog.server")).loadIdolCatalog();
}

/** Warm chain + R2/Neon catalog cache. */
export async function ensureSeedLibrary() {
  await loadIdolCatalog();
}

function mediaImageToRow(img: MediaImage, tokenId: number): ImageRow {
  return {
    id: normalizeMediaId(img.mediaId),
    tokenId,
    scene_id: img.scene || "profile",
    url: mediaUrlForId(img.mediaId),
    prompt: img.prompt || "",
    tags: img.tags || img.scene || "",
    source: img.type === "generated" ? "generated" : "seed",
    contentRating: img.contentRating === "NSFW" ? "NSFW" : "SFW",
  };
}

async function listLibraryRows(
  tokenId: number,
  sceneIdFilter?: string,
  sceneQuery?: string,
): Promise<ImageRow[]> {
  const library = mediaLibraryConfigured() ? await fetchMediaLibrary(tokenId) : [];
  let rows = library
    .filter((img) => !isThumbImage(img) && !["face", "banner", "cover"].includes(img.type))
    .map((img) => mediaImageToRow(img, tokenId));
  if (sceneIdFilter) {
    const ranked = filterAndRankBucketCandidates(
      library.map(libraryImageToMeta),
      tokenId,
      sceneIdFilter,
      sceneQuery ?? sceneIdFilter,
    );
    const allowed = new Set(ranked.map((r) => r.mediaId));
    rows = rows.filter((row) => allowed.has(row.id));
  }
  return mergeLibraryImageRows(rows);
}

export async function countSceneImages(tokenId: number, sceneId: string) {
  const idol = (await loadIdolCatalog()).idols.find((i) => i.tokenId === tokenId);
  if (!idol) return 0;
  const rows = await listLibraryRows(idol.tokenId);
  return rows.filter((r) => r.scene_id === sceneId).length;
}

function scoreRow(row: ImageRow, sceneId: string, hint: string) {
  const h = hint.toLowerCase();
  const hay = `${row.scene_id} ${row.tags} ${row.prompt}`.toLowerCase();
  let n = 0;
  if (row.scene_id === sceneId) n += 2;
  for (const tag of row.tags.split(/[,，\s]+/).filter((t) => t.length >= 2)) {
    if (h.includes(tag.toLowerCase())) n += 6;
  }
  const compact = h.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i += 1) {
    const gram = compact.slice(i, i + 2);
    if (hay.includes(gram)) n += 1;
  }
  for (const word of h.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)) {
    if (hay.includes(word)) n += 3;
  }
  return n;
}

export async function listUnusedImages(input: {
  tokenId: number;
  sceneId: string;
  sceneQuery?: string;
  usedImageIds: readonly string[];
  excludeImageIds?: ReadonlySet<string>;
}): Promise<ImageRow[]> {
  const used = new Set(input.usedImageIds);
  const threadIds = input.excludeImageIds;
  const idol = (await loadIdolCatalog()).idols.find((i) => i.tokenId === input.tokenId);
  if (!idol) return [];
  try {
    const rows = await listLibraryRows(
      idol.tokenId,
      input.sceneId,
      input.sceneQuery ?? input.sceneId,
    );
    const unused = unusedChatImages(rows, input.sceneId, used, threadIds);
    if (unused.length > 0) return unused;
    const all = await listLibraryRows(idol.tokenId);
    return unusedChatImages(all, input.sceneId, used, threadIds);
  } catch {
    return [];
  }
}

export function matchImageByHint(free: ImageRow[], sceneId: string, hint: string) {
  const ranked = [...free].sort(
    (a, b) =>
      scoreRow(b, sceneId, hint) - scoreRow(a, sceneId, hint) || (a.scene_id === sceneId ? -1 : 1),
  );
  return ranked[0];
}

export async function insertGeneratedImage(input: {
  tokenId: number;
  sceneId: string;
  prompt: string;
  tags: string;
  contentRating: ImageContentRating;
  bytes: Buffer;
  mime: string;
  meta?: Record<string, unknown>;
}) {
  const fileSuffix = uid();
  const published = await publishIdolImage({
    tokenId: input.tokenId,
    sceneId: input.sceneId,
    fileSuffix,
    prompt: input.prompt,
    tags: input.tags,
    contentRating: input.contentRating,
    bytes: input.bytes,
    mime: input.mime,
    type: "generated",
  });
  if (!published) return undefined;
  return { id: published.mediaId, url: mediaUrlForId(published.mediaId) };
}

export async function resolveMediaSource(id: string, size?: string) {
  const fromUrl = imageIdFromUrl(id);
  const raw = fromUrl && fromUrl !== id ? fromUrl : id;
  if (!isMediaId(raw)) return null;
  if (size === "thumb") {
    const thumbUrl = await resolveMediaThumbUrl(raw);
    if (thumbUrl) return { kind: "redirect" as const, url: thumbUrl };
  }
  const live = await resolveMediaImageUrl(raw);
  if (live) return { kind: "redirect" as const, url: live };
  return null;
}

export function sceneIdOf(idol: Idol, chapter: number) {
  return sceneId(sceneOf(idol, chapter));
}

export function sceneQueryForIdol(idol: Idol, sceneKey: string): string {
  const scenes = idol.scenes;
  if (!Array.isArray(scenes)) return sceneKey;
  const hit = scenes.find((s) => sceneId(s) === sceneKey);
  if (!hit) return sceneKey;
  return sceneMetadataSearchText(hit);
}

export function mergeUsedImageId(used: readonly string[], imageId: string): string[] {
  const key = normalizeMediaId(imageId);
  if (used.some((id) => normalizeMediaId(id) === key)) return [...used];
  return [...used, key];
}
