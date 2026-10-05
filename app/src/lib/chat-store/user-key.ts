import type { AppUser } from "../auth/use-current-user.ts";
import { passkeyRecordForAddress } from "../auth/passkey-record.ts";
import { identiconSeedFromUser, walletAddressFromUser } from "../user-profile/wallet-address.ts";

export function localAccountLookupKeys(input: {
  credentialId?: string | null;
  wallet?: string | null;
  userId?: string | null;
}): string[] {
  const keys: string[] = [];
  const add = (raw: string) => {
    const key = raw.trim();
    if (!key || keys.includes(key)) return;
    keys.push(key);
  };
  if (input.credentialId?.trim()) add(`pk:${input.credentialId.trim()}`);
  if (input.wallet?.trim()) add(input.wallet.trim().toLowerCase());
  if (input.userId?.trim()) add(input.userId.trim().toLowerCase());
  return keys;
}

function keysForUser(user: AppUser): string[] {
  const wallet = walletAddressFromUser(user);
  const rec = passkeyRecordForAddress(wallet ?? user.id);
  return localAccountLookupKeys({
    credentialId: rec?.credentialId,
    wallet: wallet ?? identiconSeedFromUser(user),
    userId: user.id,
  });
}

/** Stable OPFS/sqlite key — passkey credential when known, else smart-account address. */
export function localChatUserId(user: AppUser): string {
  return keysForUser(user)[0] ?? identiconSeedFromUser(user);
}

/**
 * Keys to try when loading local chat/profile (passkey first, then wallet,
 * then legacy `user.id`).
 */
export function localChatUserIdLookupKeys(user: AppUser): string[] {
  return keysForUser(user);
}
