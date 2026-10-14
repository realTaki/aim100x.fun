import type { AppUser } from "@/lib/auth/use-current-user";
const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;
/** Product owner comes only from the authenticated APP wallet, never identity/display fields. */
export function walletAddressFromUser(user: AppUser): `0x${string}` | null {
  if (user.isDevFallback) return null;
  const address = user.apiWalletAddress;
  return address && WALLET_RE.test(address) ? address : null;
}
export function identiconSeedFromUser(user: AppUser): string {
  return (walletAddressFromUser(user) ?? user.id).toLowerCase();
}
