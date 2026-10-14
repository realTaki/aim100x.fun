import type { Address } from "viem";
import { getLiveWalletSessionRow } from "@/lib/auth/client";
import type { AppUser } from "@/lib/auth/use-current-user";
export function externalWalletAddress(): Address | null {
  const address = getLiveWalletSessionRow()?.walletAddress;
  return address && /^0x[a-f0-9]{40}$/i.test(address) ? (address as Address) : null;
}
export async function resolveConnectedWallet(user?: AppUser | null): Promise<Address | null> {
  if (user && !user.isDevFallback && /^0x[a-f0-9]{40}$/i.test(user.id)) return user.id as Address;
  return externalWalletAddress();
}
export async function requireConnectedWallet(user?: AppUser | null) {
  const address = await resolveConnectedWallet(user);
  if (!address) throw new Error("Sign in with a wallet first");
  return address;
}
