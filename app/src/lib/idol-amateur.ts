import type { Idol } from "@/lib/idols";

/** Paid `mint()` price (display LUSD). On-chain is 20_000_000 atomic. */
export const DEFAULT_AMATEUR_SALE_USDC = 20;

/** Same ~2s on-control fail flash as subscribe. */
export const AMATEUR_MINT_FAIL_MS = 2000;
/** @deprecated use AMATEUR_MINT_FAIL_MS */
export const AMATEUR_BUY_FAIL_MS = AMATEUR_MINT_FAIL_MS;

export const AMATEUR_NAME = "mint new idol";
export const AMATEUR_AVATAR_SRC = "/new-idol-avatar.jpg";
export const AMATEUR_BANNER_SRC = "/new-idol-banner.jpg";

export const MAX_MINTS_PER_ACCOUNT = 4;
export const MAX_IDOL_SUPPLY = 100;

export function amateurMintCount(mintsOf: number): number {
  if (!Number.isFinite(mintsOf)) return 0;
  return Math.min(MAX_MINTS_PER_ACCOUNT, Math.max(0, Math.floor(mintsOf)));
}

/** Broker 素人 bio: already-minted count for this account, max 4. */
export function amateurMintBio(mintsOf = 0): string {
  return `click to mint new idol (${amateurMintCount(mintsOf)}/4)`;
}

/** @deprecated use amateurMintBio() */
export const AMATEUR_MINT_BIO = amateurMintBio(0);
/** @deprecated use amateurMintBio() */
export const AMATEUR_BUY_BIO = AMATEUR_MINT_BIO;

export type PlazaSort = "subscribers" | "receipts";

export type PlazaIdolSortKey = {
  tokenId: number;
  subscriberCount: number;
  receiptsUsdc: number;
};

export type AmateurToken = {
  tokenId: number;
  owner?: string | null;
  salePriceUsdc: number;
};

export function sameAddress(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** True unsold-at-contract 素人: still owned by the Idols100x contract. */
export function isUnsoldAmateur(
  owner: string | null | undefined,
  nftContract: string,
): boolean {
  return sameAddress(owner, nftContract);
}

export function canMintAmateur(mintsOf: number, nextTokenId: number): boolean {
  if (!Number.isFinite(mintsOf) || !Number.isFinite(nextTokenId)) return false;
  return mintsOf < MAX_MINTS_PER_ACCOUNT && nextTokenId >= 1 && nextTokenId <= MAX_IDOL_SUPPLY;
}

export function sortPlazaIdols<T extends PlazaIdolSortKey>(
  idols: readonly T[],
  sort: PlazaSort,
): T[] {
  return [...idols].sort((a, b) => {
    const primary =
      sort === "receipts"
        ? b.receiptsUsdc - a.receiptsUsdc
        : b.subscriberCount - a.subscriberCount;
    return primary || a.tokenId - b.tokenId;
  });
}

/** Plaza: public (公开) idols; hide only true unsold-at-contract 素人. */
export function publicPlazaIdols<T extends { isPublic: boolean; tokenId: number }>(
  idols: readonly T[],
  ownerByTokenId: ReadonlyMap<number, string | null | undefined>,
  nftContract: string,
): T[] {
  return idols.filter((idol) => {
    if (!idol.isPublic) return false;
    return !isUnsoldAmateur(ownerByTokenId.get(idol.tokenId), nftContract);
  });
}

/**
 * 已订阅: `subscribedIdsOf` order only.
 * Do not apply plaza `isPublic` / unsold-素人 filters — a fan can subscribe
 * to a hidden or still-contract-owned idol (direct profile / chat).
 */
export function subscribedIdolsFromCatalog<T extends { tokenId: number }>(
  idols: readonly T[],
  tokenIds: readonly number[],
): T[] {
  const byId = new Map(idols.map((idol) => [idol.tokenId, idol]));
  const out: T[] = [];
  const seen = new Set<number>();
  for (const id of tokenIds) {
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) continue;
    seen.add(id);
    const idol = byId.get(id);
    if (idol) out.push(idol);
  }
  return out;
}

/** Broker mint-slot: generated default art, mint bio. No token id until `mint()`. */
export function amateurMintIdol(
  offer: { salePriceUsdc?: number; mintsOf?: number } = {},
): Idol {
  return {
    tokenId: 0,
    isPublic: true,
    subscriberCount: 0,
    receiptsUsdc: 0,
    name: AMATEUR_NAME,
    bio: amateurMintBio(offer.mintsOf ?? 0),
    personality: "",
    look: "",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: offer.salePriceUsdc ?? DEFAULT_AMATEUR_SALE_USDC,
    avatar: AMATEUR_AVATAR_SRC,
    covers: [],
    banner: AMATEUR_BANNER_SRC,
    photos: [],
    scenePhotoUrls: {},
    mediaContentRating: {},
  };
}

/** @deprecated use amateurMintIdol */
export function amateurBuyIdol(offer: {
  tokenId?: number;
  salePriceUsdc: number;
  mintsOf?: number;
}): Idol {
  return amateurMintIdol({
    salePriceUsdc: offer.salePriceUsdc,
    mintsOf: offer.mintsOf,
  });
}

/** Lowest token id still owned by the NFT contract and listed for sale. */
export function pickBuyableAmateur<T extends AmateurToken>(
  minted: readonly T[],
  nftContract: string,
): T | undefined {
  return minted
    .filter((token) => isUnsoldAmateur(token.owner, nftContract) && token.salePriceUsdc > 0)
    .sort((a, b) => a.tokenId - b.tokenId)[0];
}
