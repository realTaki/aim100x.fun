import type { ImageContentRating } from "@/lib/image-content-rating";
import { isThumbImage, normalizeMediaId } from "./media-app-id.ts";

export type MediaSeedImage = {
  mediaId: string;
  tokenId: number;
  scene: string;
  tags: string;
  type: string;
  contentRating?: ImageContentRating | "";
  lastEdited?: string;
};

export function mediaUrlForId(id: string) {
  return `/api/media/${encodeURIComponent(normalizeMediaId(id))}`;
}

export function matchSeedImage(
  images: MediaSeedImage[],
  tokenId: number,
  localPath: string,
) {
  const mine = images.filter((i) => i.tokenId === tokenId && !isThumbImage(i));
  const file = localPath.split("/").pop() || "";
  const stem = file.replace(/(\.t)?\.jpe?g$/i, "");
  if (stem === "avatar") return mine.find((i) => i.type === "face");
  if (stem === "cover") return mine.find((i) => i.type === "cover");
  if (stem === "banner") return mine.find((i) => i.type === "banner");
  return mine.find((i) => i.scene.trim() === stem || i.scene.trim() === stem.replace(/-\d+$/, ""));
}
