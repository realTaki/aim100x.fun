/** Passkey smart-account session persistence and reload policy. */

export const WALLET_BEARER_KEY = "lonelyfuns.wallet.bearer";
export const LAST_WALLET_ID_KEY = "lonelyfuns.last-wallet-id";
export const LAST_WALLET_ADDRESS_KEY = "lonelyfuns.last-wallet-address";

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type PersistedWalletSession = {
  token: string | null;
  walletId: string | null;
  address: `0x${string}` | null;
};

export type WalletSessionDecision =
  | { userId: string; reason: "ok" }
  | { userId: null; reason: "no_session" | "invalid_account" };

export function normalizeWalletAddress(value: string | null | undefined): `0x${string}` | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!WALLET_RE.test(trimmed)) return null;
  return trimmed.toLowerCase() as `0x${string}`;
}

export function readPersistedWalletSession(
  local: StorageLike | null,
  session?: StorageLike | null,
): PersistedWalletSession {
  const token =
    readKey(local, WALLET_BEARER_KEY) ??
    readKey(session, WALLET_BEARER_KEY);
  const walletId = readKey(local, LAST_WALLET_ID_KEY) ?? readKey(session, LAST_WALLET_ID_KEY);
  const address =
    normalizeWalletAddress(readKey(local, LAST_WALLET_ADDRESS_KEY)) ??
    normalizeWalletAddress(readKey(session, LAST_WALLET_ADDRESS_KEY));
  return { token, walletId, address };
}

export function writePersistedWalletSession(
  local: StorageLike,
  input: { token?: string | null; walletId?: string | null; address?: string | null },
  session?: StorageLike | null,
): void {
  if (input.token !== undefined) writeKey(local, WALLET_BEARER_KEY, input.token);
  if (input.walletId !== undefined) writeKey(local, LAST_WALLET_ID_KEY, input.walletId);
  if (input.address !== undefined) {
    writeKey(local, LAST_WALLET_ADDRESS_KEY, normalizeWalletAddress(input.address));
  }
  if (session) {
    session.removeItem(WALLET_BEARER_KEY);
    session.removeItem(LAST_WALLET_ID_KEY);
    session.removeItem(LAST_WALLET_ADDRESS_KEY);
  }
}

export function clearPersistedWalletSession(
  local: StorageLike | null,
  session?: StorageLike | null,
): void {
  for (const store of [local, session]) {
    if (!store) continue;
    store.removeItem(WALLET_BEARER_KEY);
    store.removeItem(LAST_WALLET_ID_KEY);
    store.removeItem(LAST_WALLET_ADDRESS_KEY);
  }
}

/**
 * Restore a Passkey smart-account session after reload.
 *
 * A verified embedded JWT wins. Otherwise `walletId=passkey` plus the
 * remembered CREATE2 address stays signed in — even when `/get-session` is
 * empty. A passkey record for a *different* address is an invalid account and
 * must re-auth. This never implies WebAuthn `get()`.
 */
export function reconcilePasskeySession(input: {
  jwtUserId: string | null;
  jwtEmbedded: boolean;
  isPasskeyWalletId: boolean;
  rememberedAddress: string | null;
  passkeyRecordAddress: string | null;
}): WalletSessionDecision {
  const jwt = input.jwtEmbedded ? normalizeWalletAddress(input.jwtUserId) : null;
  if (jwt) return { userId: jwt, reason: "ok" };

  if (!input.isPasskeyWalletId) return { userId: null, reason: "no_session" };

  const remembered = normalizeWalletAddress(input.rememberedAddress);
  if (!remembered) return { userId: null, reason: "no_session" };

  const record = normalizeWalletAddress(input.passkeyRecordAddress);
  if (record && record !== remembered) {
    return { userId: null, reason: "invalid_account" };
  }
  return { userId: remembered, reason: "ok" };
}

function readKey(store: StorageLike | null | undefined, key: string): string | null {
  if (!store) return null;
  try {
    const value = store.getItem(key);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function writeKey(store: StorageLike, key: string, value: string | null | undefined): void {
  try {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } catch {
    /* quota / private mode */
  }
}
