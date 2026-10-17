import { mediaUrlForId, type MediaSeedImage } from "@/lib/idol-overlay";
import { isThumbImage } from "./media-app-id.ts";
import {
  pickLatestProfileImage,
  pickProfileAlbumImages,
} from "@/lib/profile-album";

export type { MediaSeedImage };
export { PROFILE_SCENE } from "@/lib/profile-album";

/**
 * Media bucket key: on-chain token id + scene id.
 * Example: `1/late-night`, profile art uses scene `profile`.
 */
export function mediaBucketKey(tokenId: number, sceneId: string): string {
  return `${tokenId}/${sceneId.trim()}`;
}

export function imagesInMediaBucket(
  images: MediaSeedImage[],
  tokenId: number,
  sceneId: string,
): MediaSeedImage[] {
  const scene = sceneId.trim();
  return images.filter(
    (img) =>
      img.tokenId === tokenId &&
      img.scene.trim() === scene &&
      !isThumbImage(img),
  );
}

export function bucketPhotoUrls(
  images: MediaSeedImage[],
  tokenId: number,
  sceneId: string,
): string[] {
  const mine = imagesInMediaBucket(images, tokenId, sceneId);
  const sorted = [...mine].sort((a, b) => photoSortKey(a) - photoSortKey(b));
  return [...new Set(sorted.map((i) => mediaUrlForId(i.mediaId)))];
}

function imagesForToken(images: MediaSeedImage[], tokenId: number) {
  return images.filter((img) => img.tokenId === tokenId && !isThumbImage(img));
}

/** Token Id bucket: avatar + banner singletons, cover album = Type=cover subset. */
export function profileImagesFromLibrary(
  images: MediaSeedImage[],
  tokenId: number,
): Pick<
  { avatar: string; covers: string[]; banner: string; photos: string[] },
  "avatar" | "covers" | "banner" | "photos"
> {
  const mine = imagesForToken(images, tokenId);
  const face = pickLatestProfileImage(mine, tokenId, "avatar");
  const banner = pickLatestProfileImage(mine, tokenId, "banner");
  const covers = [
    ...new Set(
      pickProfileAlbumImages(mine, tokenId, "cover").map((i) => mediaUrlForId(i.mediaId)),
    ),
  ];
  const photos = [
    ...new Set(
      mine
        .filter((i) => i.type === "photo" || i.type === "generated")
        .sort((a, b) => photoSortKey(a) - photoSortKey(b))
        .map((i) => mediaUrlForId(i.mediaId)),
    ),
  ];
  return {
    avatar: face ? mediaUrlForId(face.mediaId) : "",
    covers,
    banner: banner ? mediaUrlForId(banner.mediaId) : "",
    photos,
  };
}

function photoSortKey(img: MediaSeedImage) {
  if (img.type === "cover") return 1_000_000_000_000;
  if (img.lastEdited) {
    const t = Date.parse(img.lastEdited);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}
