import type { AppUser } from "@/lib/auth/use-current-user";
import { listCatalogIdolsByTokenIds, listMintedCatalogIdols } from "@/lib/idol-catalog";
import type { Idol } from "@/lib/idols";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import { subscribedIdsOfOnChainClient } from "@/lib/subscribe/fan-membership-client";

/**
 * 已订阅 list: the same Passkey smart account used for subscribing and chat.
 * Membership from client `subscribedIdsOf`; cards from catalog without plaza filters.
 */
export async function loadSubscribedIdolsForFan(user?: AppUser | null): Promise<Idol[]> {
  const wallet = await resolveConnectedWallet(user);
  if (wallet) {
    const ids = await subscribedIdsOfOnChainClient(wallet);
    if (ids.length === 0) return [];
    return listCatalogIdolsByTokenIds({ data: { tokenIds: ids } });
  }
  if (user?.isDevFallback) return listMintedCatalogIdols();
  return [];
}
