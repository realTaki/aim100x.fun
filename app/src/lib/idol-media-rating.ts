import type { ImageContentRating } from "@/lib/image-content-rating";
import { mediaUrlForId } from "@/lib/idol-overlay";
import type { Idol } from "@/lib/idols";
import type { MediaImage } from "@/lib/media-library";
import type { ChatMsg } from "@/lib/thread";

export function buildMediaContentRatingMap(
  tokenId: number,
  images: Pick<MediaImage, "tokenId" | "mediaId" | "contentRating">[],
): Record<string, ImageContentRating> {
  const out: Record<string, ImageContentRating> = {};
  for (const img of images) {
    if (img.tokenId !== tokenId) continue;
    const url = mediaUrlForId(img.mediaId);
    out[url] = img.contentRating === "NSFW" ? "NSFW" : "SFW";
  }
  return out;
}

export function resolveImageContentRating(
  idol: Idol,
  url: string,
  explicit?: ImageContentRating,
): ImageContentRating {
  if (explicit === "NSFW" || explicit === "SFW") return explicit;
  const key = url.split("?")[0] ?? url;
  return idol.mediaContentRating[key] ?? "SFW";
}

export function isNsfwMediaLocked(
  rating: ImageContentRating,
  isFan: boolean,
  imageId: string | undefined,
  unlockedIds: ReadonlySet<string>,
  opts?: { chatPerImagePaywall?: boolean; messageUnlocked?: boolean },
): boolean {
  if (rating !== "NSFW") return false;
  if (opts?.messageUnlocked) return false;
  if (!opts?.chatPerImagePaywall && isFan) return false;
  if (imageId && unlockedIds.has(imageId)) return false;
  return true;
}

export function ratingForMessage(idol: Idol, msg: ChatMsg): ImageContentRating | undefined {
  if (!msg.imageUrl) return undefined;
  return resolveImageContentRating(idol, msg.imageUrl, msg.imageContentRating);
}
