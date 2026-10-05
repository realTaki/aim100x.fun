import { runSignOut } from "../../../scripts/sign-out-plan.mjs";
import { accountEmailFor, formatAccountLabel } from "./account-host";
import { PASSKEY_SESSION_ID, isPasskeySessionId } from "./passkey-aa";
import { requestPasskeySession } from "./passkey-client";
import {
  loadPasskeyRecord,
  parsePasskeyRecordFromBearer,
  savePasskeyRecord,
} from "./passkey-record";
import {
  clearPersistedWalletSession,
  readPersistedWalletSession,
  reconcilePasskeySession,
  writePersistedWalletSession,
} from "./wallet-session";
import { seedProfileLocale, seedProfileUsername } from "@/lib/user-profile/local";
import { readBrowserLocale } from "@/lib/locale";

/** Passkey smart-account session client. */

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";

export type WalletSessionRow = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  embedded?: boolean;
};

const SESSION_EVENT = "lf:wallet-session";

let liveRow: WalletSessionRow | null | undefined;
let hydratedLiveRow = false;

function browserLocal(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function browserSessionStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getBearerToken(): string | null {
  return readPersistedWalletSession(browserLocal(), browserSessionStore()).token;
}

function persistWalletFields(input: {
  token?: string | null;
  walletId?: string | null;
  address?: string | null;
}): void {
  const local = browserLocal();
  if (!local) return;
  writePersistedWalletSession(local, input, browserSessionStore());
}

function setBearerToken(token: string | null): void {
  persistWalletFields({ token });
}

export function notifyWalletSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function subscribeWalletSession(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onStoreChange();
  const onStorage = () => {
    hydratedLiveRow = false;
    liveRow = undefined;
    onStoreChange();
  };
  window.addEventListener(SESSION_EVENT, handler);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SESSION_EVENT, handler);
    window.removeEventListener("storage", onStorage);
  };
}

function inLivePreview(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".grok-sandbox.com")
  );
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: "include" });
}

function rowFromPasskeyAddress(address: string): WalletSessionRow {
  return {
    id: address,
    displayName: formatAccountLabel({ displayName: address }),
    primaryEmail: accountEmailFor(address),
    embedded: true,
  };
}

function setLiveWalletSessionRow(row: WalletSessionRow | null): void {
  liveRow = row;
  hydratedLiveRow = true;
  notifyWalletSessionChanged();
}

/** Sync snapshot for React — restored only from a Passkey smart-account session. */
export function getLiveWalletSessionRow(): WalletSessionRow | null | undefined {
  if (typeof window === "undefined") return undefined;
  if (!hydratedLiveRow) {
    hydratedLiveRow = true;
    const persisted = readPersistedWalletSession(browserLocal(), browserSessionStore());
    liveRow =
      persisted.address && isPasskeySessionId(persisted.walletId)
        ? rowFromPasskeyAddress(persisted.address)
        : undefined;
    if (persisted.token || persisted.walletId || persisted.address) {
      persistWalletFields(persisted);
    }
  }
  return liveRow;
}

export async function fetchWalletSession(): Promise<WalletSessionRow | null> {
  const res = await authFetch("/api/auth/get-session");
  if (!res.ok) return null;
  const body = (await res.json()) as {
    session?: { token?: string };
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      embedded?: boolean;
      passkey?: { x?: string | null; y?: string | null; credentialId?: string | null } | null;
    };
  };
  if (typeof body.session?.token === "string" && body.session.token) {
    setBearerToken(body.session.token);
  }
  const user = body.user;
  if (!user?.id || user.embedded !== true) return null;
  if (
    user.passkey &&
    typeof user.passkey.x === "string" &&
    typeof user.passkey.y === "string" &&
    typeof user.passkey.credentialId === "string"
  ) {
    savePasskeyRecord({
      address: user.id as `0x${string}`,
      x: user.passkey.x as `0x${string}`,
      y: user.passkey.y as `0x${string}`,
      credentialId: user.passkey.credentialId,
    });
  }
  return {
    id: user.id,
    displayName: user.name ?? null,
    primaryEmail: user.email ?? null,
    embedded: true,
  };
}

async function dropWalletSession(): Promise<void> {
  clearPersistedWalletSession(browserLocal(), browserSessionStore());
  resumeOnce = Promise.resolve(null);
  setLiveWalletSessionRow(null);
  try {
    await authFetch("/api/auth/sign-out", { method: "POST" });
  } catch {
    /* cookie clear is best-effort; UI already dropped the session */
  }
}

let resumeOnce: Promise<WalletSessionRow | null> | null = null;

/** Restore a Passkey session across reloads without prompting WebAuthn. */
export function resumeConnectedWalletSession(): Promise<WalletSessionRow | null> {
  resumeOnce ??= resumeConnectedWalletSessionOnce();
  return resumeOnce;
}

async function resumeConnectedWalletSessionOnce(): Promise<WalletSessionRow | null> {
  try {
    return await resumeConnectedWalletSessionUncaught();
  } catch {
    await dropWalletSession();
    return null;
  }
}

async function resumeConnectedWalletSessionUncaught(): Promise<WalletSessionRow | null> {
  const persisted = readPersistedWalletSession(browserLocal(), browserSessionStore());
  if (persisted.token || persisted.walletId || persisted.address) {
    persistWalletFields(persisted);
  }

  let jwtUser: WalletSessionRow | null = null;
  try {
    jwtUser = await fetchWalletSession();
  } catch {
    jwtUser = null;
  }

  const passkeyRecord =
    loadPasskeyRecord() ?? parsePasskeyRecordFromBearer(persisted.token);
  const decision = reconcilePasskeySession({
    jwtUserId: jwtUser?.id ?? null,
    jwtEmbedded: jwtUser?.embedded === true,
    isPasskeyWalletId: isPasskeySessionId(persisted.walletId),
    rememberedAddress: persisted.address,
    passkeyRecordAddress: passkeyRecord?.address ?? null,
  });
  if (!decision.userId) {
    await dropWalletSession();
    return null;
  }

  persistWalletFields({
    address: decision.userId,
    walletId: PASSKEY_SESSION_ID,
  });
  if (
    passkeyRecord &&
    passkeyRecord.address.toLowerCase() === decision.userId.toLowerCase()
  ) {
    savePasskeyRecord(passkeyRecord);
  }
  const row =
    jwtUser?.id.toLowerCase() === decision.userId.toLowerCase()
      ? { ...jwtUser, embedded: true as const }
      : rowFromPasskeyAddress(decision.userId);
  setLiveWalletSessionRow(row);
  return row;
}

export async function signInWithPasskey(
  callbackURL = "/",
  opts?: { createName?: string },
): Promise<void> {
  // WebAuthn must run in the same turn as the click. Awaiting sign-out first
  // drops the user gesture, so the OS sheet never appears (iframe preview and
  // Safari). Local token is overwritten after a successful assertion.
  const { token, record } = await requestPasskeySession(opts);
  setBearerToken(token);
  persistWalletFields({
    address: record.address,
    walletId: PASSKEY_SESSION_ID,
    token,
  });
  const signedIn = rowFromPasskeyAddress(record.address);
  resumeOnce = Promise.resolve(signedIn);
  setLiveWalletSessionRow(signedIn);
  const signupName = opts?.createName?.trim() || record.username;
  if (signupName) seedProfileUsername(`pk:${record.credentialId}`, signupName);
  if (opts?.createName) seedProfileLocale(`pk:${record.credentialId}`, readBrowserLocale());

  if (typeof window !== "undefined") {
    const dest = new URL(callbackURL, window.location.origin);
    const here = window.location;
    if (
      dest.origin !== here.origin ||
      dest.pathname !== here.pathname ||
      dest.search !== here.search
    ) {
      window.location.href = callbackURL;
    }
  }
}

export async function signOut(redirectTo = "/"): Promise<void> {
  await runSignOut({
    livePreview: inLivePreview(),
    hasBearer: Boolean(getBearerToken()),
    requestSignOut: async () => {
      const res = await authFetch("/api/auth/sign-out", { method: "POST" });
      if (!res.ok) throw new Error("Sign-out failed");
    },
    clearToken: () => {
      clearPersistedWalletSession(browserLocal(), browserSessionStore());
      resumeOnce = Promise.resolve(null);
      liveRow = null;
      hydratedLiveRow = true;
    },
    redirect: () => {
      notifyWalletSessionChanged();
      window.location.href = redirectTo;
    },
  });
}

/** Stub for legacy imports — session hook lives in `use-current-user.ts`. */
export const authClient = {
  useSession: () => {
    throw new Error("authClient.useSession removed — use useCurrentUserState()");
  },
};
