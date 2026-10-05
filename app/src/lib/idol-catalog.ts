import { createServerFn } from "@tanstack/react-start";
import type { Idol } from "@/lib/idols";

export type AmateurMintOffer = {
  salePriceUsdc: number;
  /** How many idols this account has already minted (0–4). */
  mintsOf: number;
};

/** @deprecated use AmateurMintOffer */
export type AmateurBuyOffer = AmateurMintOffer & { tokenId?: number };

export type ManagerHub = {
  owned: Idol[];
  nextAmateur: AmateurMintOffer | null;
};

export const listPlazaIdols = createServerFn({ method: "GET" }).handler(
  async (): Promise<Idol[]> => {
    const { loadPlazaIdols } = await import("@/lib/idol-catalog.server");
    return loadPlazaIdols();
  },
);

/** Full minted catalog (no plaza public/素人 filter). Auth-off 已订阅 + token-id hydrate. */
export const listMintedCatalogIdols = createServerFn({ method: "GET" }).handler(
  async (): Promise<Idol[]> => {
    const { loadIdolCatalog } = await import("@/lib/idol-catalog.server");
    return (await loadIdolCatalog()).idols;
  },
);

/**
 * Hydrate plaza cards for on-chain membership ids.
 * No auth: `subscribedIdsOf` is public. No isPublic/素人 plaza filter.
 */
export const listCatalogIdolsByTokenIds = createServerFn({ method: "POST" })
  .validator((input: { tokenIds: number[] }) => ({
    tokenIds: input.tokenIds
      .filter((n) => Number.isSafeInteger(n) && n > 0)
      .slice(0, 200),
  }))
  .handler(async ({ data }): Promise<Idol[]> => {
    const { loadIdolsByTokenIds } = await import("@/lib/idol-catalog.server");
    return loadIdolsByTokenIds(data.tokenIds);
  });

/** Pass the same connected/passkey wallet used for subscribe — not a JWT-only server look-up. */
export const listSubscribedIdols = createServerFn({ method: "GET" })
  .validator((input: { wallet: string }) => input)
  .handler(async ({ data }): Promise<Idol[]> => {
    const { loadSubscribedIdolsForWallet } = await import("@/lib/idol-catalog.server");
    return loadSubscribedIdolsForWallet(data.wallet);
  });

export const getCatalogIdol = createServerFn({ method: "GET" })
  .validator((input: { tokenId: number }) => input)
  .handler(async ({ data }): Promise<Idol | null> => {
    const { loadIdolByTokenId } = await import("@/lib/idol-catalog.server");
    return (await loadIdolByTokenId(data.tokenId)) ?? null;
  });

export const listManagerIdols = createServerFn({ method: "GET" })
  .validator((input: { wallet: string; force?: boolean }) => input)
  .handler(async ({ data }): Promise<ManagerHub> => {
    const { loadManagerHub } = await import("@/lib/idol-manager.server");
    return loadManagerHub(data.wallet, data.force === true);
  });

/** Manager page: load minted idol by token id. UI edit is owner-only; chain still rejects other wallets. */
export const getManagerIdol = createServerFn({ method: "GET" })
  .validator((input: { tokenId: number }) => input)
  .handler(async ({ data }): Promise<Idol | null> => {
    const { loadIdolByTokenId } = await import("@/lib/idol-catalog.server");
    return (await loadIdolByTokenId(data.tokenId)) ?? null;
  });
