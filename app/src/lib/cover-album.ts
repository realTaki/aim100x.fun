import type { MediaImage } from "./media-library.ts";
import { mediaUrlForId } from "./idol-overlay.ts";
import { pickProfileAlbumImages } from "./profile-album.ts";

export type CoverAlbumItem = {
  mediaId: string;
  thumbUrl: string;
  fullUrl: string;
};

/** One payload for the cover grid: thumbs to paint, stable full URLs to prefetch. */
export function coverAlbumItemsFromLibrary(
  images: MediaImage[],
  tokenId: number,
): CoverAlbumItem[] {
  return pickProfileAlbumImages(images, tokenId, "cover").map((img) => ({
    mediaId: img.mediaId,
    thumbUrl: img.thumbnailUrl || `${mediaUrlForId(img.mediaId)}?size=thumb`,
    fullUrl: mediaUrlForId(img.mediaId),
  }));
}

export async function fetchCoverAlbum(tokenId: number): Promise<CoverAlbumItem[]> {
  const res = await fetch(`/api/media/covers/${tokenId}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: CoverAlbumItem[] };
  return json.items ?? [];
}
