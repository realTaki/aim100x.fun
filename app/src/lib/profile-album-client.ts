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
    extra?.mediaId ? `/api/manager/profile-album/${tokenId}` : `/api/manager/profile-image/${tokenId}`,
    {
      method: extra?.mediaId ? "PATCH" : "POST",
      headers: albumAuthHeaders(),
      body,
    },
  );
  if (!res.ok) throw new Error(await readError(res, "Couldn't upload"));
}

export async function addCoversFromPool(
  tokenId: number,
  mediaIds: string[],
): Promise<void> {
  const ids = mediaIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) return;
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "POST",
    headers: { ...albumAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ mediaIds: ids, kind: "cover" }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't add"));
}

export async function replaceCoverFromPool(
  tokenId: number,
  slotMediaId: string,
  fromMediaId: string,
): Promise<void> {
  const body = new FormData();
  body.set("mediaId", slotMediaId);
  body.set("fromMediaId", fromMediaId);
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "PATCH",
    headers: albumAuthHeaders(),
    body,
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't replace"));
}

export async function deleteAlbumMedia(
  tokenId: number,
  mediaIds: string[],
  kind: ImageSlotKind,
): Promise<void> {
  const res = await fetch(`/api/manager/profile-album/${tokenId}`, {
    method: "DELETE",
    headers: { ...albumAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ mediaIds, kind }),
  });
  if (!res.ok) throw new Error(await readError(res, "Couldn't delete"));
}
