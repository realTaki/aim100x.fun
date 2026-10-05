import type { AppUser } from "@/lib/auth/use-current-user";
import { ACCOUNT_EMAIL_DOMAIN } from "@/lib/auth/account-host";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

/** Smart-account address from the signed-in Passkey session. */
export function walletAddressFromUser(user: AppUser): `0x${string}` | null {
  const id = user.id.trim();
  if (WALLET_RE.test(id)) return id as `0x${string}`;
  const email = user.primaryEmail?.trim();
  if (email?.endsWith(`@${ACCOUNT_EMAIL_DOMAIN}`)) {
    const raw = email.slice(0, email.indexOf("@"));
    if (WALLET_RE.test(raw)) return raw as `0x${string}`;
  }
  const name = user.displayName?.trim();
  if (name && WALLET_RE.test(name)) return name as `0x${string}`;
  return null;
}

/** Seed for deterministic identicons — smart account when available, else stable user id. */
export function identiconSeedFromUser(user: AppUser): string {
  const wallet = walletAddressFromUser(user);
  return (wallet ?? user.id).toLowerCase();
}
