import type { Idol } from "@/lib/idols";
import { buildIdolFromChainAndImages } from "@/lib/idol-onchain";
import type { MintedIdolOnChain } from "@/lib/idols100x-chain.server";
import type { MediaSeedImage } from "@/lib/idol-overlay";
import type { MediaImage } from "@/lib/media-library";

export type MintedIdolToken = {
  tokenId: number;
};

export function buildIdolsForMinted(
  minted: readonly MintedIdolOnChain[],
  images: MediaSeedImage[],
  libraryImages: MediaImage[] = [],
): Idol[] {
  return minted.map((token) => buildIdolFromChainAndImages(token, images, libraryImages));
}
