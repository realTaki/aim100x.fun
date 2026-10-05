import { mediaUrlForId, type NotionSeedImage } from "@/lib/idol-overlay";
import { isThumbImage } from "./media-app-id.ts";
import {
  pickLatestProfileImage,
  pickProfileAlbumImages,
} from "@/lib/profile-album";

export type { NotionSeedImage };
export { NOTION_PROFILE_SCENE } from "@/lib/profile-album";

/**
 * Notion image bucket key: immutable on-chain token id + scene id.
 * Example: `1/late-night`, profile art uses scene `profile`.
 */
export function notionImageBucketKey(tokenId: number, sceneId: string): string {
  return `${tokenId}/${sceneId.trim()}`;
}

export function imagesInNotionBucket(
  images: NotionSeedImage[],
  tokenId: number,
  sceneId: string,
): NotionSeedImage[] {
  const scene = sceneId.trim();
  return images.filter(
    (img) =>
      img.tokenId === tokenId &&
      img.scene.trim() === scene &&
      !isThumbImage(img),
  );
}

export function bucketPhotoUrls(
  images: NotionSeedImage[],
  tokenId: number,
  sceneId: string,
): string[] {
  const mine = imagesInNotionBucket(images, tokenId, sceneId);
  const sorted = [...mine].sort((a, b) => photoSortKey(a) - photoSortKey(b));
  return [...new Set(sorted.map((i) => mediaUrlForId(i.pageId)))];
}

function imagesForToken(images: NotionSeedImage[], tokenId: number) {
  return images.filter((img) => img.tokenId === tokenId && !isThumbImage(img));
}

/** Token Id bucket: avatar + banner singletons, cover album = Type=cover subset. */
export function profileImagesFromNotion(
  images: NotionSeedImage[],
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
      pickProfileAlbumImages(mine, tokenId, "cover").map((i) => mediaUrlForId(i.pageId)),
    ),
  ];
  const photos = [
    ...new Set(
      mine
        .filter((i) => i.type === "photo" || i.type === "generated")
        .sort((a, b) => photoSortKey(a) - photoSortKey(b))
        .map((i) => mediaUrlForId(i.pageId)),
    ),
  ];
  return {
    avatar: face ? mediaUrlForId(face.pageId) : "",
    covers,
    banner: banner ? mediaUrlForId(banner.pageId) : "",
    photos,
  };
}

function photoSortKey(img: NotionSeedImage) {
  if (img.type === "cover") return 1_000_000_000_000;
  if (img.lastEdited) {
    const t = Date.parse(img.lastEdited);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}
