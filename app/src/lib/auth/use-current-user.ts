import { useEffect, useSyncExternalStore } from "react";
import {
  authEnabled,
  getLiveWalletSessionRow,
  resumeConnectedWalletSession,
  subscribeWalletSession,
  type WalletSessionRow,
} from "./client";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
  embedded?: boolean;
};

export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

const DEV_USER_STATE: CurrentUserState = {
  user: DEV_USER,
  isPending: false,
};

let cached: { id: string; user: AppUser } | null = null;
let resumeStarted = false;

function appUserFromRow(row: WalletSessionRow): AppUser {
  if (cached?.id === row.id) return cached.user;
  const user: AppUser = {
    id: row.id,
    displayName: row.displayName,
    primaryEmail: row.primaryEmail,
    profileImageUrl: null,
    isDevFallback: false,
    embedded: row.embedded === true,
  };
  cached = { id: row.id, user };
  return user;
}

function getSessionSnapshot(): AppUser | null | undefined {
  const row = getLiveWalletSessionRow();
  if (row === undefined) return undefined;
  if (row === null) return null;
  return appUserFromRow(row);
}

function getSessionLoaded(): boolean {
  return getLiveWalletSessionRow() !== undefined;
}

function useWalletSessionState(): CurrentUserState {
  const loaded = useSyncExternalStore(subscribeWalletSession, getSessionLoaded, () => false);
  const snapshot = useSyncExternalStore(
    subscribeWalletSession,
    getSessionSnapshot,
    () => undefined,
  );

  useEffect(() => {
    if (resumeStarted) return;
    resumeStarted = true;
    void resumeConnectedWalletSession().catch(() => {
      /* snapshot already hydrated from localStorage; a flaky /get-session must not log out */
    });
  }, []);

  if (!loaded || snapshot === undefined) {
    return { user: null, isPending: true };
  }
  return { user: snapshot, isPending: false };
}

export function useCurrentUserState(): CurrentUserState {
  if (!authEnabled) return DEV_USER_STATE;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant
  return useWalletSessionState();
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
