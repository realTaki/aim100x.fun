/** R2/Neon photo library. */
import { createHash, randomUUID } from "node:crypto";
import type { ImageContentRating } from "@/lib/image-content-rating";
import type { MediaSeedImage } from "@/lib/idol-overlay";
import { downscaleJpeg } from "@/lib/image-thumb.server";
import { slotWritesThumbnail } from "@/lib/image-aspect";
import {
  dashedMediaId,
  isMediaId,
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

export type MediaImage = {
  mediaId: string;
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

export const mediaLibraryConfigured = mediaStorageConfigured;
export function imageDigest(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
function imageId(id: string) {
  if (!isMediaId(id)) throw new Error("Invalid media ID");
  return dashedMediaId(id);
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
function imageRow(row: Record<string, unknown>): MediaImage {
  return {
    mediaId: String(row.id),
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
}): Promise<{ mediaId: string } | null> {
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
  invalidateMediaLibraryCache();
  return { mediaId: id };
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

export async function setMediaImageType(mediaId: string, type: string): Promise<boolean> {
  const rows = await mediaSql()`UPDATE aim_idol_media SET type = ${type}, updated_at = now()
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(mediaId)} AND archived_at IS NULL RETURNING id`;
  invalidateMediaLibraryCache();
  return rows.length > 0;
}

export async function ensureAlbumThumbnail(input: {
  tokenId: number;
  mediaId: string;
  bytes?: Buffer;
  hasThumbnail?: boolean;
  replaceExisting?: boolean;
}): Promise<void> {
  if (input.hasThumbnail && !input.replaceExisting) return;
  let source = input.bytes;
  if (!source) {
    const urls = await resolveMediaUrls(input.mediaId);
    if (urls.thumbnail && !input.replaceExisting) return;
    if (!urls.image) return;
    const response = await fetch(urls.image);
    if (!response.ok) throw new Error("R2 image download failed");
    source = Buffer.from(await response.arrayBuffer());
  }
  const thumbnail = source.length < 80_000 ? source : ((await downscaleJpeg(source)) ?? source);
  await replaceFile(input.mediaId, thumbnail, "image/jpeg", true);
}

export async function clearMediaThumbnail(mediaId: string): Promise<boolean> {
  // Detach only; retaining prior objects makes concurrent readers and recovery safe.
  const rows =
    await mediaSql()`UPDATE aim_idol_media SET thumbnail_key = NULL, thumbnail_sha256 = NULL, updated_at = now()
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(mediaId)} AND archived_at IS NULL RETURNING id`;
  invalidateMediaLibraryCache();
  return rows.length > 0;
}
export async function unflagCoverAlbumRows(rows: { mediaId: string }[]): Promise<number> {
  let n = 0;
  for (const row of rows) if (await setMediaImageType(row.mediaId, "photo")) n++;
  return n;
}
export async function flagPoolRowAsCover(row: MediaImage): Promise<boolean> {
  if (isThumbImage(row) || row.type === "face" || row.type === "banner") return false;
  if (!(await setMediaImageType(row.mediaId, "cover"))) return false;
  await ensureAlbumThumbnail({
    tokenId: row.tokenId,
    mediaId: row.mediaId,
    hasThumbnail: row.hasThumbnail,
  });
  return true;
}

export async function resolveMediaUrls(mediaId: string): Promise<{
  image?: string;
  thumbnail?: string;
  chatPaywalled?: boolean;
  tokenId?: number;
}> {
  if (!isMediaId(mediaId)) return {};
  const [row] =
    await mediaSql()`SELECT token_id, image_key, thumbnail_key, content_rating, type FROM aim_idol_media
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(mediaId)} AND archived_at IS NULL`;
  if (!row) return {};
  return {
    tokenId: Number(row.token_id),
    image: await signedMediaUrl(row.image_key),
    thumbnail: row.thumbnail_key ? await signedMediaUrl(row.thumbnail_key) : undefined,
    chatPaywalled: row.content_rating === "NSFW" && !["face", "banner", "cover"].includes(row.type),
  };
}
export async function resolveMediaImageUrl(mediaId: string) {
  return (await resolveMediaUrls(mediaId)).image;
}
export async function resolveMediaThumbUrl(mediaId: string) {
  const urls = await resolveMediaUrls(mediaId);
  return urls.thumbnail || urls.image;
}
export async function archiveMediaImages(mediaIds: string[]): Promise<number> {
  let n = 0;
  for (const mediaId of mediaIds) {
    const rows = await mediaSql()`UPDATE aim_idol_media SET archived_at = now(), updated_at = now()
      WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${imageId(mediaId)} AND archived_at IS NULL RETURNING id`;
    n += rows.length;
  }
  invalidateMediaLibraryCache();
  return n;
}
export async function replaceMediaImage(input: {
  mediaId: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}): Promise<boolean> {
  return replaceFile(input.mediaId, input.bytes, input.mime, false);
}
async function replaceFile(
  mediaId: string,
  bytes: Buffer,
  mime: string,
  thumbnail: boolean,
): Promise<boolean> {
  const id = imageId(mediaId);
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
  invalidateMediaLibraryCache();
  return true;
}

let libraryCache: { at: number; images: MediaImage[] } | null = null;
export function invalidateMediaLibraryCache() {
  libraryCache = null;
}
export async function fetchMediaLibrary(tokenId?: number): Promise<MediaImage[]> {
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
export async function fetchMediaSeedImages() {
  return (await fetchMediaLibrary())
    .filter((img) => img.type !== "generated" && !isThumbImage(img))
    .map((img): MediaSeedImage => ({
      mediaId: img.mediaId,
      tokenId: img.tokenId,
      scene: img.scene,
      tags: img.tags,
      type: img.type,
      contentRating: img.contentRating,
      lastEdited: img.lastEdited,
    }));
}
