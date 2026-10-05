import type { NotionLibraryImage } from "./notion-images.ts";
import { mediaUrlForId } from "./idol-overlay.ts";
import { pickProfileAlbumImages } from "./profile-album.ts";

export type CoverAlbumItem = {
  pageId: string;
  thumbUrl: string;
  fullUrl: string;
};

/** One payload for the cover grid: thumbs to paint, stable full URLs to prefetch. */
export function coverAlbumItemsFromLibrary(
  images: NotionLibraryImage[],
  tokenId: number,
): CoverAlbumItem[] {
  return pickProfileAlbumImages(images, tokenId, "cover").map((img) => ({
    pageId: img.pageId,
    thumbUrl: img.thumbnailUrl || `${mediaUrlForId(img.pageId)}?size=thumb`,
    fullUrl: mediaUrlForId(img.pageId),
  }));
}

export async function fetchCoverAlbum(tokenId: number): Promise<CoverAlbumItem[]> {
  const res = await fetch(`/api/media/covers/${tokenId}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { items?: CoverAlbumItem[] };
  return json.items ?? [];
}
