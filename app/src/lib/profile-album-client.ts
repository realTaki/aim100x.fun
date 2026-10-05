import { getBearerToken } from "@/lib/auth/client";
import { slotWritesThumbnail, type ImageSlotKind } from "@/lib/image-aspect";

export function albumAuthHeaders(): Record<string, string> {
  const token = getBearerToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(res: Response, fallback: string): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return json.error || fallback;
}

export async function uploadProfileSlot(
  tokenId: number,
  kind: ImageSlotKind,
  result: { full: Blob; thumb: Blob },
  extra?: Record<string, string>,
): Promise<void> {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", result.full, "crop.jpg");
  if (slotWritesThumbnail(kind)) body.set("thumb", result.thumb, "thumb.jpg");
  if (extra) {
    for (const [k, v] of Object.entries(extra)) body.set(k, v);
  }
  const res = await fetch(
    extra?.pageId ? `/api/manager/profile-album/${tokenId}` : `/api/manager/profile-image/${tokenId}`,
    {
      method: extra?.pageId ? "PATCH" : "POST",
      headers: albumAuthHeaders(),
      body,
    },
  );
  if (!res.ok) throw new Error(await readError(res, "Couldn't upload"));
}

export async function addCoversFromPool(
  tokenId: number,
  pageIds: string[],
): Promise<void> {
  const ids = pageIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return;
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "POST",
    headers: { ...albumAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ pageIds: ids, kind: "cover" }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't add"));
}

export async function replaceCoverFromPool(
  tokenId: number,
  slotPageId: string,
  fromPageId: string,
): Promise<void> {
  const body = new FormData();
  body.set("pageId", slotPageId);
  body.set("fromPageId", fromPageId);
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "PATCH",
    headers: albumAuthHeaders(),
    body,
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't replace"));
}

export async function deleteAlbumPages(
  tokenId: number,
  pageIds: string[],
  kind: ImageSlotKind,
): Promise<void> {
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "DELETE",
    headers: { ...albumAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ pageIds, kind }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't delete"));
}
