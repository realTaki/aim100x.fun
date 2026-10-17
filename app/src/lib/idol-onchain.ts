import type { Idol } from "@/lib/idols";
import { sceneId } from "@/lib/idol-fields";
import { candidatePhotoUrlsForScene } from "@/lib/media-bucket-candidates";
import { profileImagesFromLibrary } from "@/lib/media-bucket";
import { buildMediaContentRatingMap } from "@/lib/idol-media-rating";
import type { MediaSeedImage } from "@/lib/idol-overlay";
import type { MintedIdolOnChain } from "@/lib/idols100x-chain.server";
import type { MediaImage } from "@/lib/media-library";

export function buildIdolFromChainAndImages(
  token: MintedIdolOnChain,
  images: MediaSeedImage[],
  libraryImages: MediaImage[] = [],
): Idol {
  const visualSource = libraryImages.length > 0 ? libraryImages : images;
  const visuals = profileImagesFromLibrary(visualSource, token.tokenId);
  const scenePhotoUrls: Record<string, string[]> = {};
  const ratingSource =
    libraryImages.length > 0
      ? libraryImages
      : images.map((img) => ({
          tokenId: img.tokenId,
          mediaId: img.mediaId,
          contentRating: img.contentRating ?? "",
        }));
  const mediaContentRating = buildMediaContentRatingMap(token.tokenId, ratingSource);
  const idol: Idol = {
    tokenId: token.tokenId,
    isPublic: token.isPublic,
    subscriberCount: token.subscriberCount,
    receiptsUsdc: token.receiptsUsdc,
    name: token.name,
    bio: token.bio,
    personality: token.personality,
    look: token.look,
    voice: token.voice,
    website: token.website,
    twitter: token.twitter,
    welcome: token.welcome,
    scenes: token.scenes,
    subscribePriceUsdc: token.subscribePriceUsdc,
    imageUnlockPriceUsdc: token.imageUnlockPriceUsdc,
    salePriceUsdc: token.salePriceUsdc,
    ...visuals,
    scenePhotoUrls,
    mediaContentRating,
  };
  for (const scene of idol.scenes) {
    const sid = sceneId(scene);
    scenePhotoUrls[sid] = candidatePhotoUrlsForScene(images, token.tokenId, scene);
  }
  return idol;
}
