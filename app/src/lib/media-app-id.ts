/** Cover-album and avatar thumbs are a Thumbnail file on the same page, not `{appId}.t`. */

export function normalizeMediaId(id: string): string {
  const raw = id.trim();
  const compact = raw.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(compact)) return compact.toLowerCase();
  return raw;
}

export function isNotionPageId(id: string): boolean {
  return /^[0-9a-f]{32}$/i.test(id.trim().replace(/-/g, ""));
}

export function dashedNotionPageId(id: string): string {
  const compact = id.trim().replace(/-/g, "").toLowerCase();
  if (compact.length !== 32) return id.trim();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

/** Leftover junk rows tagged `thumb` (old sibling pages). Product rows never use this tag. */
export function isThumbImage(img: { tags?: string }): boolean {
  return splitTagNames(img.tags ?? "").includes("thumb");
}

export function splitTagNames(tags: string): string[] {
  return tags
    .split(/[,，]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function mediaUrlIsThumbRequest(url: string): boolean {
  try {
    const parsed = new URL(url, "https://lonelyfuns.local");
    return parsed.searchParams.get("size") === "thumb";
  } catch {
    return /(?:\?|&)size=thumb(?:&|$)/.test(url);
  }
}

export function stripMediaSizeParam(src: string): string {
  const [path, query] = src.split("?");
  if (!path || !query) return src;
  const params = new URLSearchParams(query);
  params.delete("size");
  const next = params.toString();
  return next ? `${path}?${next}` : path;
}
