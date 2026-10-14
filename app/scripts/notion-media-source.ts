/** Read-only Notion source for the one-time media migration. */
import type { NotionLibraryImage } from "../src/lib/notion-images.ts";
import { NOTION_IMAGE_CONTENT_RATING_PROPERTY } from "../src/lib/image-content-rating.ts";
import {
  NOTION_IMAGE_SCENE_PROPERTY,
  NOTION_IMAGE_TAGS_PROPERTY,
  NOTION_IMAGE_THUMBNAIL_PROPERTY,
  NOTION_IMAGE_TOKEN_ID_PROPERTY,
  NOTION_IMAGE_TYPE_PROPERTY,
} from "../src/lib/notion-image-schema.ts";
const API = "https://api.notion.com/v1";
function notionToken() {
  return process.env.NOTION_TOKEN;
}
function headers() {
  if (!notionToken()) throw new Error("NOTION_TOKEN is required for migration");
  return {
    Authorization: `Bearer ${notionToken()}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  };
}
function filesUrlFromProperty(properties: Record<string, unknown> | undefined, name: string) {
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
  if (!notionToken()) throw new Error("NOTION_TOKEN is required for migration");
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
    if (!res.ok) throw new Error(`Notion query failed (${res.status})`);
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

export async function fetchMigrationSource() {
  const databaseId = process.env.NOTION_IMAGES_DATABASE_ID?.trim();
  if (!databaseId) throw new Error("NOTION_IMAGES_DATABASE_ID is required for migration");
  const pages = await queryDatabase(databaseId);
  const images = pages
    .map(parseImagePage)
    .filter((image): image is NotionLibraryImage => Boolean(image));
  return { pages, images, skipped: pages.length - images.length };
}
