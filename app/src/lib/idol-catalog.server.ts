import type { Idol } from "@/lib/idols";
import { buildIdolsForMinted } from "@/lib/idol-catalog-build";
import type { NotionSeedImage } from "@/lib/idol-overlay";
import {
  fetchNotionLibraryImages,
  fetchNotionSeedImages,
  notionImagesConfigured,
} from "@/lib/notion-images";
import { fetchMintedIdolTokens } from "@/lib/idols100x-chain.server";
import { publicPlazaIdols, sortPlazaIdols, subscribedIdolsFromCatalog } from "@/lib/idol-amateur";
import { IDOLS100X_ADDRESS } from "@/lib/idols100x";

export type IdolCatalog = {
  idols: Idol[];
  seedImages: NotionSeedImage[];
  minted: Awaited<ReturnType<typeof fetchMintedIdolTokens>>;
};

const TTL_MS = 60_000;
let cache: { at: number; value: IdolCatalog } | null = null;

function emptyCatalog(
  minted: Awaited<ReturnType<typeof fetchMintedIdolTokens>> = [],
): IdolCatalog {
  return { idols: [], seedImages: [], minted };
}

async function loadNotionSeedImages(): Promise<NotionSeedImage[]> {
  if (!notionImagesConfigured()) return [];
  try {
    return await fetchNotionSeedImages();
  } catch {
    return [];
  }
}

async function loadNotionLibraryImages() {
  if (!notionImagesConfigured()) return [];
  try {
    return await fetchNotionLibraryImages();
  } catch {
    return [];
  }
}

export async function loadIdolCatalog(force = false): Promise<IdolCatalog> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const minted = await fetchMintedIdolTokens(force);
  if (minted.length === 0) {
    const value = emptyCatalog(minted);
    cache = { at: Date.now(), value };
    return value;
  }
  const libraryImages = await loadNotionLibraryImages();
  const seedImages = await loadNotionSeedImages();
  const idols = buildIdolsForMinted(minted, seedImages, libraryImages);
  const value: IdolCatalog = {
    idols,
    seedImages,
    minted,
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function loadIdolByTokenId(tokenId: number): Promise<Idol | undefined> {
  if (!Number.isSafeInteger(tokenId) || tokenId < 1) return undefined;
  const catalog = await loadIdolCatalog();
  return catalog.idols.find((c) => c.tokenId === tokenId);
}

/** 广场: public (公开) idols that already have a broker; hide contract-owned 素人. */
export async function loadPlazaIdols(): Promise<Idol[]> {
  const catalog = await loadIdolCatalog();
  const ownerByTokenId = new Map(
    catalog.minted.map((token) => [token.tokenId, token.owner] as const),
  );
  return sortPlazaIdols(
    publicPlazaIdols(catalog.idols, ownerByTokenId, IDOLS100X_ADDRESS),
    "subscribers",
  );
}

/** Catalog cards for token ids — no plaza public/素人 filter. Force-refresh if cache is missing any id. */
export async function loadIdolsByTokenIds(tokenIds: readonly number[]): Promise<Idol[]> {
  const unique = [
    ...new Set(tokenIds.filter((n) => Number.isSafeInteger(n) && n > 0)),
  ];
  if (unique.length === 0) return [];
  let catalog = await loadIdolCatalog();
  const missing = unique.some((id) => !catalog.idols.some((idol) => idol.tokenId === id));
  if (missing) catalog = await loadIdolCatalog(true);
  return subscribedIdolsFromCatalog(catalog.idols, unique);
}

/** 已订阅: on-chain `subscribedIdsOf(wallet)` (includes hidden and unsold 素人). */
export async function loadSubscribedIdolsForWallet(wallet: string): Promise<Idol[]> {
  const { walletAddressFromUserId, subscribedTokenIdsForFan } = await import(
    "@/lib/idols100x-membership-chain.server"
  );
  const fan = walletAddressFromUserId(wallet);
  if (!fan) return [];
  return loadIdolsByTokenIds(await subscribedTokenIdsForFan(fan));
}

/** 已订阅: JWT/passkey user id is the fan wallet (checksum-tolerant). */
export async function loadSubscribedIdolsForUser(userId: string): Promise<Idol[]> {
  const { listSubscribedTokenIdsForUser } = await import(
    "@/lib/subscribe/fan-membership.server"
  );
  return loadIdolsByTokenIds(await listSubscribedTokenIdsForUser(userId));
}
