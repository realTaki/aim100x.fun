import type { Address } from "viem";
import { DEV_USER_ID } from "@/lib/auth/verify.server";
import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import {
  fanSubscribedOnChain,
  subscribedTokenIdsForFan,
  walletAddressFromUserId,
} from "@/lib/idols100x-membership-chain.server";

export async function isFanForWallet(wallet: string, tokenId: number): Promise<boolean> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return false;
  const idol = await loadIdolByTokenId(tokenId);
  if (!idol) return false;
  return fanSubscribedOnChain(wallet as Address, idol.tokenId);
}

export async function isFanMembershipActive(
  userId: string,
  tokenId: number,
  _bearerToken?: string,
): Promise<boolean> {
  if (userId === DEV_USER_ID) return true;
  const wallet = walletAddressFromUserId(userId);
  if (!wallet) return false;
  const idol = await loadIdolByTokenId(tokenId);
  if (!idol) return false;
  return fanSubscribedOnChain(wallet, idol.tokenId);
}

export async function listSubscribedTokenIdsForUser(userId: string): Promise<number[]> {
  if (userId === DEV_USER_ID) {
    const { loadIdolCatalog } = await import("@/lib/idol-catalog.server");
    const catalog = await loadIdolCatalog();
    return catalog.idols.map((i) => i.tokenId);
  }
  const wallet = walletAddressFromUserId(userId);
  if (!wallet) return [];
  return subscribedTokenIdsForFan(wallet);
}

export function resolveFanWallet(userId: string): Address | null {
  return walletAddressFromUserId(userId);
}
