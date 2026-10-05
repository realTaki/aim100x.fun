import type { Idol } from "@/lib/idols";
import { buildIdolFromChainAndImages } from "@/lib/idol-onchain";
import type { MintedIdolOnChain } from "@/lib/idols100x-chain.server";
import type { NotionSeedImage } from "@/lib/idol-overlay";
import type { NotionLibraryImage } from "@/lib/notion-images";

export type MintedIdolToken = {
  tokenId: number;
};

export function buildIdolsForMinted(
  minted: readonly MintedIdolOnChain[],
  images: NotionSeedImage[],
  libraryImages: NotionLibraryImage[] = [],
): Idol[] {
  return minted.map((token) => buildIdolFromChainAndImages(token, images, libraryImages));
}
