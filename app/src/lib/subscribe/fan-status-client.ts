import type { Address } from "viem";
import { getCatalogIdol } from "@/lib/idol-catalog";
import { fanSubscribedOnChainClient } from "@/lib/subscribe/fan-membership-client";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";

/** 已订阅 — reads Idols100x on Monad; no Postgres. */
export async function isFanOfTokenId(
  tokenId: number,
  wallet?: Address | null,
): Promise<boolean> {
  const fan = wallet ?? (await resolveConnectedWallet(null));
  if (!fan) return false;
  const idol = await getCatalogIdol({ data: { tokenId } });
  if (!idol) return false;
  return fanSubscribedOnChainClient(fan, idol.tokenId);
}
