/** Shared idol photo library in the owner's Notion. Chat rows only store links. */

import type { ImageContentRating } from "@/lib/image-content-rating";
import { NOTION_IMAGE_CONTENT_RATING_PROPERTY } from "@/lib/image-content-rating";
import type { NotionSeedImage } from "@/lib/idol-overlay";
import {
  NOTION_IMAGE_SCENE_PROPERTY,
  NOTION_IMAGE_TAGS_PROPERTY,
  NOTION_IMAGE_THUMBNAIL_PROPERTY,
  NOTION_IMAGE_TOKEN_ID_PROPERTY,
  NOTION_IMAGE_TYPE_PROPERTY,
} from "@/lib/notion-image-schema";
import { downscaleJpeg } from "@/lib/image-thumb.server";
import { slotWritesThumbnail } from "@/lib/image-aspect";
import {
  dashedNotionPageId,
  isThumbImage,
  splitTagNames,
} from "@/lib/media-app-id";

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

export const NOTION_HUB_PAGE_ID = "NOTION_PAGE_ID_REMOVED";
export const NOTION_IMAGES_DATABASE_ID = "NOTION_DATABASE_ID_REMOVED";

const NOTION_VERSION = "2022-06-28";
const API = "https://api.notion.com/v1";

function notionToken(): string | undefined {
  const fromEnv = process.env.NOTION_TOKEN?.trim();
  return fromEnv || undefined;
}

export function notionImagesConfigured(): boolean {
  return Boolean(notionToken());
}

function headers(json = true): HeadersInit {
  const token = notionToken();
  if (!token) throw new Error("NOTION_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function tagNamesFromInput(tags: string | string[]): string[] {
  const raw = Array.isArray(tags) ? tags : splitTagNames(tags);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of raw) {
    const name = tag.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 20) break;
  }
  return out;
}

function humanImageTitle(input: {
  tokenId: number;
  sceneId: string;
  type: string;
}): string {
  const scene = input.sceneId.trim() || "photo";
  if (input.type === "face") return `${input.tokenId} · avatar`.slice(0, 80);
  if (input.type === "banner") return `${input.tokenId} · banner`.slice(0, 80);
  if (input.type === "cover" && scene === "profile") {
    return `${input.tokenId} · cover`.slice(0, 80);
  }
  return `${input.tokenId} · ${scene}`.slice(0, 80);
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
  /** Notion Images `Type` select (face, cover, banner, photo, generated). */
  type?: string;
  /** Cover-album / avatar low-res file on the same page (`Thumbnail`). */
  thumbBytes?: Buffer;
}): Promise<{ pageId: string } | null> {
  if (!notionToken()) return null;
  const type = input.type ?? "photo";
  const filename = `${input.tokenId}-${input.sceneId}-${input.fileSuffix}.jpg`;
  const imageFile = await uploadNotionFile(filename, input.bytes, input.mime);
  if (!imageFile) return null;
  let thumbBytes = input.thumbBytes;
  if (!thumbBytes) {
    thumbBytes =
      input.bytes.length < 80_000 ? input.bytes : ((await downscaleJpeg(input.bytes)) ?? input.bytes);
  }

  const title = humanImageTitle({
    tokenId: input.tokenId,
    sceneId: input.sceneId,
    type,
  });
  const properties: Record<string, unknown> = {
    Name: { title: [{ type: "text", text: { content: title } }] },
    [NOTION_IMAGE_SCENE_PROPERTY]: {
      select: { name: input.sceneId.trim() || "chat" },
    },
    [NOTION_IMAGE_TOKEN_ID_PROPERTY]: { number: input.tokenId },
    [NOTION_IMAGE_TAGS_PROPERTY]: {
      multi_select: tagNamesFromInput(input.tags).map((name) => ({ name })),
    },
    Prompt: {
      rich_text: [{ type: "text", text: { content: input.prompt.slice(0, 1900) } }],
    },
    [NOTION_IMAGE_TYPE_PROPERTY]: { select: { name: type } },
    [NOTION_IMAGE_CONTENT_RATING_PROPERTY]: {
      select: { name: input.contentRating },
    },
    Image: { files: [imageFile] },
  };
  if (thumbBytes) {
    const thumbName = `${input.tokenId}-${input.sceneId}-thumb.jpg`;
    const thumbFile = await uploadNotionFile(thumbName, thumbBytes, "image/jpeg");
    if (thumbFile) {
      properties[NOTION_IMAGE_THUMBNAIL_PROPERTY] = { files: [thumbFile] };
    }
  }
  const res = await fetch(`${API}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      parent: { database_id: NOTION_IMAGES_DATABASE_ID },
      properties,
    }),
  });
  if (!res.ok) return null;
  const page = (await res.json()) as { id?: string };
  const pageId = page.id;
  if (!pageId) return null;
  invalidateNotionLibraryCache();
  return { pageId };
}

/** Profile bucket (`profile` scene): avatar, banner, or cover-album row — never stored on-chain. */
export async function publishIdolProfileImage(input: {
  tokenId: number;
  kind: "avatar" | "cover" | "banner";
  bytes: Buffer;
  mime: string;
  contentRating?: ImageContentRating;
  thumbBytes?: Buffer;
}): Promise<{ pageId: string } | null> {
  const suffix =
    input.kind === "avatar"
      ? "avatar"
      : input.kind === "banner"
        ? "banner"
        : `${Date.now().toString(36)}:cover`;
  const type =
    input.kind === "avatar" ? "face" : input.kind === "banner" ? "banner" : "cover";
  let thumbBytes: Buffer | undefined;
  if (slotWritesThumbnail(input.kind)) {
    const source = input.thumbBytes ?? input.bytes;
    thumbBytes =
      source.length < 80_000 ? source : ((await downscaleJpeg(source)) ?? source);
  }
  return publishIdolImage({
    tokenId: input.tokenId,
    sceneId: "profile",
    fileSuffix: suffix,
    prompt: `manager profile ${input.kind}`,
    tags: input.kind,
    contentRating: input.contentRating ?? "SFW",
    bytes: input.bytes,
    mime: input.mime,
    type,
    thumbBytes,
  });
}

export async function setNotionImageType(pageId: string, type: string): Promise<boolean> {
  if (!notionToken() || !pageId) return false;
  const res = await fetch(`${API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      properties: { [NOTION_IMAGE_TYPE_PROPERTY]: { select: { name: type } } },
    }),
  });
  if (!res.ok) return false;
  invalidateNotionLibraryCache();
  return true;
}

async function downloadUrlBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function ensureAlbumThumbnail(input: {
  tokenId: number;
  pageId: string;
  bytes?: Buffer;
  hasThumbnail?: boolean;
  replaceExisting?: boolean;
}): Promise<void> {
  if (input.hasThumbnail && !input.replaceExisting) return;
  let bytes = input.bytes ?? null;
  if (!bytes) {
    const urls = await resolveNotionMediaUrls(input.pageId);
    if (urls.thumbnail && !input.replaceExisting) return;
    if (urls.image) bytes = await downloadUrlBytes(urls.image);
  }
  if (!bytes) return;
  const thumbBytes =
    input.bytes && input.bytes.length < 80_000
      ? input.bytes
      : ((await downscaleJpeg(bytes)) ?? bytes);
  await replaceNotionPageFile({
    pageId: input.pageId,
    property: NOTION_IMAGE_THUMBNAIL_PROPERTY,
    bytes: thumbBytes,
    mime: "image/jpeg",
    filename: `${input.tokenId}-thumb.jpg`,
  });
}

export async function clearNotionPageThumbnail(pageId: string): Promise<boolean> {
  if (!notionToken() || !pageId) return false;
  const res = await fetch(`${API}/pages/${dashedNotionPageId(pageId)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      properties: { [NOTION_IMAGE_THUMBNAIL_PROPERTY]: { files: [] } },
    }),
  });
  if (!res.ok) return false;
  invalidateNotionLibraryCache();
  return true;
}

export async function unflagCoverAlbumRows(
  rows: { pageId: string }[],
): Promise<number> {
  let n = 0;
  for (const row of rows) {
    if (await setNotionImageType(row.pageId, "photo")) n += 1;
  }
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

export async function resolveNotionMediaUrls(
  pageId: string,
): Promise<{ image?: string; thumbnail?: string }> {
  if (!notionToken() || !pageId) return {};
  const res = await fetch(`${API}/pages/${dashedNotionPageId(pageId)}`, {
    headers: headers(),
  });
  if (!res.ok) return {};
  const page = (await res.json()) as { properties?: Record<string, unknown> };
  return {
    image: filesUrlFromProperty(page.properties, "Image"),
    thumbnail: filesUrlFromProperty(page.properties, NOTION_IMAGE_THUMBNAIL_PROPERTY),
  };
}

export async function resolveNotionImageUrl(pageId: string): Promise<string | undefined> {
  return (await resolveNotionMediaUrls(pageId)).image;
}

export async function resolveNotionThumbUrl(pageId: string): Promise<string | undefined> {
  const urls = await resolveNotionMediaUrls(pageId);
  return urls.thumbnail || urls.image;
}

async function createFileUpload(filename: string, mime: string): Promise<string | null> {
  const res = await fetch(`${API}/file_uploads`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      mode: "single_part",
      filename,
      content_type: mime || "image/jpeg",
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string };
  return body.id ?? null;
}

async function sendFileUpload(
  uploadId: string,
  filename: string,
  bytes: Buffer,
  mime: string,
): Promise<boolean> {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime || "image/jpeg" }), filename);
  const res = await fetch(`${API}/file_uploads/${uploadId}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: form,
  });
  return res.ok;
}

async function uploadNotionFile(
  filename: string,
  bytes: Buffer,
  mime: string,
): Promise<{ type: "file_upload"; file_upload: { id: string }; name: string } | null> {
  const uploadId = await createFileUpload(filename, mime);
  if (!uploadId) return null;
  const sent = await sendFileUpload(uploadId, filename, bytes, mime);
  if (!sent) return null;
  return { type: "file_upload", file_upload: { id: uploadId }, name: filename };
}

function filesUrlFromProperty(
  properties: Record<string, unknown> | undefined,
  name: string,
) {
  if (!properties) return undefined;
  const image = properties[name] as
    | {
        files?: {
          file?: { url?: string };
          external?: { url?: string };
        }[];
      }
    | undefined;
  const file = image?.files?.[0];
  return file?.file?.url || file?.external?.url;
}

type NotionQueryPage = {
  id?: string;
  properties?: Record<string, unknown>;
  last_edited_time?: string;
};

async function queryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>,
): Promise<NotionQueryPage[]> {
  if (!notionToken()) return [];
  const out: NotionQueryPage[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`${API}/databases/${databaseId}/query`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        page_size: 100,
        start_cursor: cursor,
        ...(filter ? { filter } : {}),
      }),
    });
    if (!res.ok) return out;
    const body = (await res.json()) as {
      results?: NotionQueryPage[];
      has_more?: boolean;
      next_cursor?: string | null;
    };
    out.push(...(body.results ?? []));
    cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
  } while (cursor);
  return out;
}

function numberFromProperty(prop: unknown): number | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as { type?: string; number?: number | null };
  if (p.type === "number" && typeof p.number === "number" && p.number > 0) {
    return Math.trunc(p.number);
  }
  return null;
}

function plainText(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as {
    type?: string;
    title?: { plain_text?: string }[];
    rich_text?: { plain_text?: string }[];
    select?: { name?: string };
  };
  if (p.type === "select") return p.select?.name ?? "";
  const bits = p.title ?? p.rich_text ?? [];
  return bits.map((b) => b.plain_text ?? "").join("");
}

function filesHasValue(prop: unknown): boolean {
  if (!prop || typeof prop !== "object") return false;
  const p = prop as { files?: unknown[] };
  return Array.isArray(p.files) && p.files.length > 0;
}

function tagsFromProperty(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as {
    type?: string;
    multi_select?: { name?: string }[];
  };
  if (p.type === "multi_select") {
    return (p.multi_select ?? [])
      .map((o) => o.name ?? "")
      .filter(Boolean)
      .join(", ");
  }
  return plainText(prop);
}

function parseImagePage(page: NotionQueryPage): NotionLibraryImage | null {
  if (!page.id || !page.properties) return null;
  const title = plainText(page.properties.Name).toLowerCase();
  if (title.includes("probe")) return null;
  const tokenId = numberFromProperty(page.properties[NOTION_IMAGE_TOKEN_ID_PROPERTY]);
  if (tokenId === null) return null;
  const scene = plainText(page.properties[NOTION_IMAGE_SCENE_PROPERTY]).trim();
  if (!scene) return null;
  const type = plainText(page.properties[NOTION_IMAGE_TYPE_PROPERTY]);
  return {
    pageId: page.id,
    tokenId,
    scene,
    tags: tagsFromProperty(page.properties[NOTION_IMAGE_TAGS_PROPERTY]),
    prompt: plainText(page.properties.Prompt),
    type,
    contentRating: (() => {
      const raw = plainText(page.properties[NOTION_IMAGE_CONTENT_RATING_PROPERTY]).trim();
      return raw === "SFW" || raw === "NSFW" ? raw : "";
    })(),
    lastEdited: page.last_edited_time,
    hasThumbnail: filesHasValue(page.properties[NOTION_IMAGE_THUMBNAIL_PROPERTY]),
    imageUrl: filesUrlFromProperty(page.properties, "Image"),
    thumbnailUrl: filesUrlFromProperty(page.properties, NOTION_IMAGE_THUMBNAIL_PROPERTY),
  };
}

export async function archiveNotionImagePages(pageIds: string[]): Promise<number> {
  if (!notionToken() || pageIds.length === 0) return 0;
  let archived = 0;
  for (const pageId of pageIds) {
    const res = await fetch(`${API}/pages/${dashedNotionPageId(pageId)}`, {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify({ archived: true }),
    });
    if (res.ok) archived += 1;
  }
  if (archived > 0) invalidateNotionLibraryCache();
  return archived;
}

export async function replaceNotionPageImage(input: {
  pageId: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}): Promise<boolean> {
  return replaceNotionPageFile({ ...input, property: "Image" });
}

async function replaceNotionPageFile(input: {
  pageId: string;
  property: string;
  bytes: Buffer;
  mime: string;
  filename: string;
}): Promise<boolean> {
  if (!notionToken()) return false;
  const file = await uploadNotionFile(input.filename, input.bytes, input.mime);
  if (!file) return false;
  const res = await fetch(`${API}/pages/${dashedNotionPageId(input.pageId)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      properties: {
        [input.property]: { files: [file] },
      },
    }),
  });
  if (!res.ok) return false;
  invalidateNotionLibraryCache();
  return true;
}

let libraryCache: { at: number; images: NotionLibraryImage[] } | null = null;

export function invalidateNotionLibraryCache() {
  libraryCache = null;
}

export async function fetchNotionLibraryImages(tokenId?: number) {
  if (!libraryCache || Date.now() - libraryCache.at > 60_000) {
    const pages = await queryDatabase(NOTION_IMAGES_DATABASE_ID);
    libraryCache = {
      at: Date.now(),
      images: pages
        .map(parseImagePage)
        .filter((img): img is NotionLibraryImage => Boolean(img)),
    };
  }
  const images = libraryCache.images;
  if (tokenId === undefined) return images;
  return images.filter((img) => img.tokenId === tokenId);
}

export async function fetchNotionSeedImages() {
  const images = await fetchNotionLibraryImages();
  return images
    .filter((img) => img.type !== "generated" && !isThumbImage(img))
    .map(
      (img): NotionSeedImage => ({
        pageId: img.pageId,
        tokenId: img.tokenId,
        scene: img.scene,
        tags: img.tags,
        type: img.type,
        contentRating: img.contentRating,
        lastEdited: img.lastEdited,
      }),
    );
}
