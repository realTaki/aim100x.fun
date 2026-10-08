import { getAddress } from "viem";
import type { AppUser } from "@/lib/auth/use-current-user";
import { sessionUserFromRequest } from "@/lib/auth/wallet-auth-http.server";
import { isWalletIdolManager } from "@/lib/idol-manager.server";
import { walletAddressFromUserId } from "@/lib/idols100x-membership-chain.server";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export async function managerWalletFromRequest(
  request: Request,
  tokenId: number,
): Promise<{ wallet: `0x${string}` } | { error: string; status: 401 | 403 }> {
  const user = await sessionUserFromRequest(request);
  if (!user) return { error: "Sign in required", status: 401 };
  const fromId = walletAddressFromUserId(user.id);
  const wallet =
    fromId ?? (WALLET_RE.test(user.id) ? (getAddress(user.id) as `0x${string}`) : null);
  if (!wallet || !user.loginAddress || wallet.toLowerCase() !== user.loginAddress.toLowerCase())
    return { error: "Wallet session required", status: 403 };
  if (!(await isWalletIdolManager(wallet, tokenId))) {
    return { error: "Not the idol manager", status: 403 };
  }
  return { wallet };
}

export function walletFromAppUser(user: AppUser): `0x${string}` | null {
  const fromId = walletAddressFromUserId(user.id);
  if (fromId) return fromId;
  if (WALLET_RE.test(user.id)) return getAddress(user.id) as `0x${string}`;
  return null;
}
