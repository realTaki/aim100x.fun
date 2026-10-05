import type { Idol } from "@/lib/idols";
import { sceneId } from "@/lib/idol-fields";
import { candidatePhotoUrlsForScene } from "@/lib/notion-bucket-candidates";
import { profileImagesFromNotion } from "@/lib/notion-bucket";
import { buildMediaContentRatingMap } from "@/lib/idol-media-rating";
import type { NotionSeedImage } from "@/lib/idol-overlay";
import type { MintedIdolOnChain } from "@/lib/idols100x-chain.server";
import type { NotionLibraryImage } from "@/lib/notion-images";

export function buildIdolFromChainAndImages(
  token: MintedIdolOnChain,
  images: NotionSeedImage[],
  libraryImages: NotionLibraryImage[] = [],
): Idol {
  const visualSource = libraryImages.length > 0 ? libraryImages : images;
  const visuals = profileImagesFromNotion(visualSource, token.tokenId);
  const scenePhotoUrls: Record<string, string[]> = {};
  const ratingSource =
    libraryImages.length > 0
      ? libraryImages
      : images.map((img) => ({
          tokenId: img.tokenId,
          pageId: img.pageId,
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
