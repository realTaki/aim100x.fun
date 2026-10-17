import { normalizeMediaId } from "@/lib/media-app-id";

export type ImageRow = {
  id: string;
  tokenId: number;
  scene_id: string;
  url: string;
  prompt: string;
  tags: string;
  source: string;
  contentRating?: "SFW" | "NSFW";
};

export function imageIdFromUrl(url: string): string | undefined {
  const path = url.split("?")[0] ?? url;
  const prefix = "/api/media/";
  if (!path.startsWith(prefix)) return undefined;
  let raw: string;
  try {
    raw = decodeURIComponent(path.slice(prefix.length));
  } catch {
    raw = path.slice(prefix.length);
  }
  return raw ? normalizeMediaId(raw) : undefined;
}

export function mergeLibraryImageRows(rows: ImageRow[]): ImageRow[] {
  const seen = new Set<string>();
  const out: ImageRow[] = [];
  for (const row of rows) {
    const key = normalizeMediaId(row.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, id: key });
  }
  return out;
}

export function unusedChatImages(
  rows: readonly ImageRow[],
  sceneId: string,
  used: ReadonlySet<string>,
  exclude?: ReadonlySet<string>,
): ImageRow[] {
  const usedKeys = new Set(
    [...used, ...(exclude ?? [])].map((id) => normalizeMediaId(id)),
  );
  const free = rows.filter((r) => !usedKeys.has(normalizeMediaId(r.id)));
  const inScene = free.filter((r) => r.scene_id === sceneId);
  return inScene.length > 0 ? inScene : free;
}