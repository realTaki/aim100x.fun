import type { Address } from "viem";
import { isPasskeyClientSession } from "@/lib/auth/passkey-client";
import { readPersistedWalletSession } from "@/lib/auth/wallet-session";
import type { AppUser } from "@/lib/auth/use-current-user";
import { walletAddressFromUser } from "@/lib/user-profile/wallet-address";

function persistedAddress(): Address | null {
  if (typeof window === "undefined") return null;
  try {
    return readPersistedWalletSession(window.localStorage, window.sessionStorage).address;
  } catch {
    return null;
  }
}

/**
 * The signed-in Passkey smart-account address for fan and chat ownership.
 */
export async function resolveConnectedWallet(user?: AppUser | null): Promise<Address | null> {
  const fromUser = user ? walletAddressFromUser(user) : null;
  if (user?.embedded && fromUser) return fromUser;
  if (!isPasskeyClientSession()) return null;
  const persisted = persistedAddress();
  if (persisted) return persisted;
  return fromUser;
}

export async function requireConnectedWallet(user?: AppUser | null): Promise<Address> {
  const wallet = await resolveConnectedWallet(user);
  if (!wallet) throw new Error("Sign in with a passkey first");
  return wallet;
}
