/** R2/Neon photo library. Legacy export names and UUIDs preserve existing links. */
import { createHash, randomUUID } from "node:crypto";
import type { ImageContentRating } from "@/lib/image-content-rating";
import type { NotionSeedImage } from "@/lib/idol-overlay";
import { downscaleJpeg } from "@/lib/image-thumb.server";
import { slotWritesThumbnail } from "@/lib/image-aspect";
import {
  dashedNotionPageId,
  isNotionPageId,
  isThumbImage,
  splitTagNames,
} from "@/lib/media-app-id";
import {
  MEDIA_COLLECTION_SCOPE,
  MEDIA_OBJECT_PREFIX,
  mediaStorageConfigured,
  mediaSql,
  putMediaObject,
  deleteMediaObject,
  signedMediaUrl,
} from "./media-storage.server.ts";

export type NotionLibraryImage = {
  pageId: string;
  tokenId: number;
  scene: string;
  tags: string;
  prompt: string;
  type: string;
  contentRating: ImageContentRating | "";
  lastEdited?: string;
  hasThumbnail?: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
};

export const notionImagesConfigured = mediaStorageConfigured;
export function imageDigest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
function imageId(id: string) {
  if (!isNotionPageId(id)) throw new Error("Invalid media ID");
  return dashedNotionPageId(id);
}
function tagNames(tags: string | string[]) {
  return [
    ...new Set(
      (Array.isArray(tags) ? tags : splitTagNames(tags))
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ]
    .slice(0, 20)
    .join(", ");
}
function imageRow(row: Record<string, unknown>): NotionLibraryImage {
  return {
    pageId: String(row.id),
    tokenId: Number(row.token_id),
    scene: String(row.scene),
    tags: String(row.tags),
    prompt: String(row.prompt),
    type: String(row.type),
    contentRating: row.content_rating as ImageContentRating | "",
    lastEdited: new Date(String(row.updated_at)).toISOString(),
    hasThumbnail: Boolean(row.thumbnail_key),
  };
}

export async function publishIdolImage(input: {
  tokenId: number;
  sceneId: string;
  fileSuffix: string;
  prompt: string;
  tags: string | string[];
  contentRating: ImageContentRating;
  bytes: Buffer;
  mime: string;
  type?: string;
  thumbBytes?: Buffer;
}): Promise<{ pageId: string } | null> {
  if (!mediaStorageConfigured()) throw new Error("R2/Neon media storage is not configured");
  const id = randomUUID();
  const imageKey = `${MEDIA_OBJECT_PREFIX}/${id}/${randomUUID()}`;
  const thumbKey = `${MEDIA_OBJECT_PREFIX}/${id}/${randomUUID()}`;
  const downscaled =
    !input.thumbBytes && input.bytes.length >= 80_000 ? await downscaleJpeg(input.bytes) : null;
  const thumbnail = input.thumbBytes ?? downscaled ?? input.bytes;
  const thumbnailMime = input.thumbBytes || downscaled ? "image/jpeg" : input.mime;
  const uploaded: string[] = [];
  let metadataWriteStarted = false;
  try {
    await putMediaObject(imageKey, input.bytes, input.mime);
    uploaded.push(imageKey);
    await putMediaObject(thumbKey, thumbnail, thumbnailMime);
    uploaded.push(thumbKey);
    metadataWriteStarted = true;
    await mediaSql()`INSERT INTO aim_idol_media
      (collection_scope, id, token_id, scene, tags, prompt, type, content_rating, image_key, thumbnail_key, mime, image_sha256, thumbnail_sha256)
      VALUES (${MEDIA_COLLECTION_SCOPE}, ${id}, ${input.tokenId}, ${input.sceneId.trim() || "chat"}, ${tagNames(input.tags)}, ${input.prompt},
      ${input.type ?? "photo"}, ${input.contentRating}, ${imageKey}, ${thumbKey}, ${input.mime}, ${imageDigest(input.bytes)}, ${imageDigest(thumbnail)})`;
  } catch (error) {
    // A database timeout can occur after commit. Retain files in that case.
    if (!metadataWriteStarted) await Promise.allSettled(uploaded.map(deleteMediaObject));
    throw error;
  }
  invalidateNotionLibraryCache();
  return { pageId: id };
}

export async function publishIdolProfileImage(input: {
  tokenId: number;
  kind: "avatar" | "cover" | "banner";
  bytes: Buffer;
  mime: string;
  contentRating?: ImageContentRating;
  thumbBytes?: Buffer;
}) {
  const source = input.thumbBytes ?? input.bytes;
  const thumbnail = slotWritesThumbnail(input.kind)
    ? source.length < 80_000
      ? source
      : ((await downscaleJpeg(source)) ?? source)
    : undefined;
  return publishIdolImage({
    ...input,
    sceneId: "profile",
    fileSuffix: input.kind,
    prompt: `manager profile ${input.kind}`,
    tags: input.kind,
    contentRating: input.contentRating ?? "SFW",
    type: input.kind === "avatar" ? "face" : input.kind,
    thumbBytes: thumbnail,
  });
}

export async function setNotionImageType(pageId: string, type: string): Promise<boolean> {
  const rows = await mediaSql()`UPDATE aim_idol_media SET type = ${type}, updated_at = now()
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(pageId)} AND archived_at IS NULL RETURNING id`;
  invalidateNotionLibraryCache();
  return rows.length > 0;
}

export async function ensureAlbumThumbnail(input: {
  tokenId: number;
  pageId: string;
  bytes?: Buffer;
  hasThumbnail?: boolean;
  replaceExisting?: boolean;
}): Promise<void> {
  if (input.hasThumbnail && !input.replaceExisting) return;
  let source = input.bytes;
  if (!source) {
    const urls = await resolveNotionMediaUrls(input.pageId);
    if (urls.thumbnail && !input.replaceExisting) return;
    if (!urls.image) return;
    const response = await fetch(urls.image);
    if (!response.ok) throw new Error("R2 image download failed");
    source = Buffer.from(await response.arrayBuffer());
  }
  const thumbnail = source.length < 80_000 ? source : ((await downscaleJpeg(source)) ?? source);
  await replaceFile(input.pageId, thumbnail, "image/jpeg", true);
}

export async function clearNotionPageThumbnail(pageId: string): Promise<boolean> {
  // Detach only; retaining prior objects makes concurrent readers and recovery safe.
  const rows =
    await mediaSql()`UPDATE aim_idol_media SET thumbnail_key = NULL, thumbnail_sha256 = NULL, updated_at = now()
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(pageId)} AND archived_at IS NULL RETURNING id`;
  invalidateNotionLibraryCache();
  return rows.length > 0;
}
export async function unflagCoverAlbumRows(rows: { pageId: string }[]): Promise<number> {
  let n = 0;
  for (const row of rows) if (await setNotionImageType(row.pageId, "photo")) n++;
  return n;
}
export async function flagPoolRowAsCover(row: NotionLibraryImage): Promise<boolean> {
  if (isThumbImage(row) || row.type === "face" || row.type === "banner") return false;
  if (!(await setNotionImageType(row.pageId, "cover"))) return false;
  await ensureAlbumThumbnail({
    tokenId: row.tokenId,
    pageId: row.pageId,
    hasThumbnail: row.hasThumbnail,
  });
  return true;
}

export async function resolveNotionMediaUrls(pageId: string): Promise<{
  image?: string;
  thumbnail?: string;
  chatPaywalled?: boolean;
  tokenId?: number;
}> {
  if (!isNotionPageId(pageId)) return {};
  const [row] =
    await mediaSql()`SELECT token_id, image_key, thumbnail_key, content_rating, type FROM aim_idol_media
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(pageId)} AND archived_at IS NULL`;
  if (!row) return {};
  return {
    tokenId: Number(row.token_id),
    image: await signedMediaUrl(row.image_key),
    thumbnail: row.thumbnail_key ? await signedMediaUrl(row.thumbnail_key) : undefined,
    chatPaywalled: row.content_rating === "NSFW" && !["face", "banner", "cover"].includes(row.type),
  };
}
export async function resolveNotionImageUrl(pageId: string) {
  return (await resolveNotionMediaUrls(pageId)).image;
}
export async function resolveNotionThumbUrl(pageId: string) {
  const urls = await resolveNotionMediaUrls(pageId);
  return urls.thumbnail || urls.image;
}
export async function archiveNotionImagePages(pageIds: string[]): Promise<number> {
  let n = 0;
  for (const pageId of pageIds) {
    const rows = await mediaSql()`UPDATE aim_idol_media SET archived_at = now(), updated_at = now()
      WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(pageId)} AND archived_at IS NULL RETURNING id`;
    n += rows.length;
  }
  invalidateNotionLibraryCache();
  return n;
}
export async function replaceNotionPageImage(input: {
  pageId: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}): Promise<boolean> {
  return replaceFile(input.pageId, input.bytes, input.mime, false);
}
async function replaceFile(
  pageId: string,
  bytes: Buffer,
  mime: string,
  thumbnail: boolean,
): Promise<boolean> {
  const id = imageId(pageId);
  const key = `${MEDIA_OBJECT_PREFIX}/${id}/${randomUUID()}`;
  await putMediaObject(key, bytes, mime);
  const sql = mediaSql();
  const rows = thumbnail
    ? await sql`UPDATE aim_idol_media SET thumbnail_key = ${key}, thumbnail_sha256 = ${imageDigest(bytes)}, updated_at = now()
          WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id} AND archived_at IS NULL RETURNING id`
    : await sql`UPDATE aim_idol_media SET image_key = ${key}, image_sha256 = ${imageDigest(bytes)}, mime = ${mime}, updated_at = now()
          WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id} AND archived_at IS NULL RETURNING id`;
  if (!rows.length) {
    await deleteMediaObject(key);
    return false;
  }
  invalidateNotionLibraryCache();
  return true;
}

let libraryCache: { at: number; images: NotionLibraryImage[] } | null = null;
export function invalidateNotionLibraryCache() {
  libraryCache = null;
}
export async function fetchNotionLibraryImages(tokenId?: number): Promise<NotionLibraryImage[]> {
  if (!libraryCache || Date.now() - libraryCache.at > 60_000) {
    const rows =
      await mediaSql()`SELECT id, token_id, scene, tags, prompt, type, content_rating, updated_at, thumbnail_key
      FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND archived_at IS NULL ORDER BY updated_at DESC, id`;
    libraryCache = { at: Date.now(), images: rows.map(imageRow) };
  }
  return tokenId === undefined
    ? libraryCache.images
    : libraryCache.images.filter((img) => img.tokenId === tokenId);
}
export async function fetchNotionSeedImages() {
  return (await fetchNotionLibraryImages())
    .filter((img) => img.type !== "generated" && !isThumbImage(img))
    .map((img): NotionSeedImage => ({
      pageId: img.pageId,
      tokenId: img.tokenId,
      scene: img.scene,
      tags: img.tags,
      type: img.type,
      contentRating: img.contentRating,
      lastEdited: img.lastEdited,
    }));
}
