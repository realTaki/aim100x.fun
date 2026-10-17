import type { MediaImage } from "@/lib/media-library";
import type { MediaSeedImage } from "@/lib/idol-overlay";
import { isThumbImage } from "./media-app-id.ts";

export type ProfileImageKind = "avatar" | "cover" | "banner";

/** Profile scene id used when uploading avatar / banner / new album files. */
export const PROFILE_SCENE = "profile";

type ProfileImageRow = Pick<
  MediaSeedImage | MediaImage,
  "mediaId" | "scene" | "tags" | "type"
> & { lastEdited?: string; hasThumbnail?: boolean };

/** Album / avatar / banner matching is Token Id + Type. */
export function profileImageMatchesKind(
  img: ProfileImageRow,
  kind: ProfileImageKind,
): boolean {
  if (isThumbImage(img)) return false;
  if (kind === "avatar") return img.type === "face";
  if (kind === "banner") return img.type === "banner";
  return img.type === "cover";
}

/** Unflagged pool (chat candidates): not avatar, not banner, not album. */
export function profileImageIsPool(img: ProfileImageRow): boolean {
  if (isThumbImage(img)) return false;
  return img.type !== "face" && img.type !== "banner" && img.type !== "cover";
}

export function sortProfileAlbumRows<T extends ProfileImageRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ta = a.lastEdited ? Date.parse(a.lastEdited) : 0;
    const tb = b.lastEdited ? Date.parse(b.lastEdited) : 0;
    if (tb !== ta) return tb - ta;
    return b.mediaId.localeCompare(a.mediaId);
  });
}

export function pickProfileAlbumImages<
  T extends ProfileImageRow & { tokenId: number },
>(images: T[], tokenId: number, kind: ProfileImageKind): T[] {
  return sortProfileAlbumRows(
    images.filter((img) => img.tokenId === tokenId && profileImageMatchesKind(img, kind)),
  );
}

export function pickLatestProfileImage<
  T extends ProfileImageRow & { tokenId: number },
>(images: T[], tokenId: number, kind: ProfileImageKind): T | undefined {
  return pickProfileAlbumImages(images, tokenId, kind)[0];
}

export function pickPoolImages<T extends ProfileImageRow & { tokenId: number }>(
  images: T[],
  tokenId: number,
): T[] {
  return sortProfileAlbumRows(
    images.filter((img) => img.tokenId === tokenId && profileImageIsPool(img)),
  );
}

/**
 * Fan plaza + profile strip: Type=banner if present, else first album cover.
 * Does not mutate Type. Manager 横幅 stays a dedicated Type=banner upload slot.
 */
export function idolDisplayStrip(idol: {
  banner?: string | null;
  covers?: readonly string[] | null;
}): { src: string; isAlbumCover: boolean } {
  const banner = idol.banner?.trim() ?? "";
  if (banner) return { src: banner, isAlbumCover: false };
  const cover = (idol.covers ?? []).find((src) => src.trim())?.trim() ?? "";
  return { src: cover, isAlbumCover: Boolean(cover) };
}
