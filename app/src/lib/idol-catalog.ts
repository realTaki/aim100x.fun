import { createServerFn } from "@tanstack/react-start";
import type { Idol } from "@/lib/idols";
import { publicIdol, chatIdol } from "./idol-config";
import { authMiddleware } from "./auth/middleware";
import type { IdolStats } from "./idol-stats";

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
    return (await loadPlazaIdols()).map(publicIdol);
  },
);

/** Public statistics share a five-second chain snapshot across the whole plaza. */
export const listIdolStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<IdolStats[]> => {
    const { loadIdolStats } = await import("./idol-stats.server");
    return loadIdolStats();
  },
);

/** Full minted catalog (no plaza public/素人 filter). Auth-off 已订阅 + token-id hydrate. */
export const listMintedCatalogIdols = createServerFn({ method: "GET" }).handler(
  async (): Promise<Idol[]> => {
    const { loadIdolCatalog } = await import("@/lib/idol-catalog.server");
    return (await loadIdolCatalog()).idols.map(publicIdol);
  },
);

/**
 * Hydrate plaza cards for on-chain membership ids.
 * No auth: `subscribedIdsOf` is public. No isPublic/素人 plaza filter.
 */
export const listCatalogIdolsByTokenIds = createServerFn({ method: "POST" })
  .validator((input: { tokenIds: number[] }) => ({
    tokenIds: input.tokenIds.filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 200),
  }))
  .handler(async ({ data }): Promise<Idol[]> => {
    const { loadIdolsByTokenIds } = await import("@/lib/idol-catalog.server");
    return (await loadIdolsByTokenIds(data.tokenIds)).map(publicIdol);
  });

/** Pass the same connected/passkey wallet used for subscribe — not a JWT-only server look-up. */
export const listSubscribedIdols = createServerFn({ method: "GET" })
  .validator((input: { wallet: string }) => input)
  .handler(async ({ data }): Promise<Idol[]> => {
    const { loadSubscribedIdolsForWallet } = await import("@/lib/idol-catalog.server");
    return (await loadSubscribedIdolsForWallet(data.wallet)).map(publicIdol);
  });

export const getCatalogIdol = createServerFn({ method: "GET" })
  .validator((input: { tokenId: number }) => input)
  .handler(async ({ data }): Promise<Idol | null> => {
    const { loadIdolByTokenId } = await import("@/lib/idol-catalog.server");
    const idol = await loadIdolByTokenId(data.tokenId);
    return idol ? publicIdol(idol) : null;
  });

export const listManagerIdols = createServerFn({ method: "GET" })
  .validator((input: { wallet: string; force?: boolean }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<ManagerHub> => {
    const { loadManagerHub } = await import("@/lib/idol-manager.server");
    const { getSessionUser } = await import("./auth/verify.server");
    const user = await getSessionUser(context.bearerToken);
    if (!user || user.id !== context.userId || !user.id) throw new Error("Unauthorized");
    const hub = await loadManagerHub(user.id, data.force === true);
    return { ...hub, owned: hub.owned.map(publicIdol) };
  });

/** Author configuration is private; always check current ownership before reading. */
export const getManagerIdol = createServerFn({ method: "GET" })
  .validator((input: { tokenId: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Idol | null> => {
    const { requireIdolManager } = await import("./idol-manager.server");
    await requireIdolManager(data.tokenId, context.userId, context.bearerToken);
    const { loadIdolByTokenId } = await import("@/lib/idol-catalog.server");
    return (await loadIdolByTokenId(data.tokenId)) ?? null;
  });

export const getChatIdol = createServerFn({ method: "GET" })
  .validator((input: { tokenId: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data, context }): Promise<Idol | null> => {
    const { isFanMembershipActive } = await import("./subscribe/fan-membership.server");
    if (!(await isFanMembershipActive(context.userId, data.tokenId, context.bearerToken)))
      return null;
    const { loadIdolByTokenId } = await import("./idol-catalog.server");
    const idol = await loadIdolByTokenId(data.tokenId);
    return idol ? chatIdol(idol) : null;
  });
