import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { AppUser } from "@/lib/auth/use-current-user";
import { identiconDataUrl } from "./identicon";
import {
  EMPTY_USER_PROFILE,
  profileWithSeededUsername,
  readUserProfileAlongKeys,
  subscribeUserProfile,
  writeUserProfile,
  type StoredUserProfile,
} from "./local";
import { identiconSeedFromUser } from "./wallet-address";
import { passkeyRecordForAddress } from "@/lib/auth/passkey-record";
import { localChatUserId, localChatUserIdLookupKeys } from "@/lib/chat-store/user-key";
import { readPreferredLocale, writePreferredLocale } from "@/lib/locale";

function shallowEqual(a: StoredUserProfile, b: StoredUserProfile): boolean {
  return (
    a.username === b.username &&
    a.bio === b.bio &&
    a.customAvatar === b.customAvatar &&
    a.locale === b.locale
  );
}

export function useUserProfile(user: AppUser | null) {
  const storeKey = user ? localChatUserId(user) : "";
  const cacheRef = useRef<{ key: string; value: StoredUserProfile }>({
    key: "",
    value: EMPTY_USER_PROFILE,
  });

  const getSnapshot = useCallback(() => {
    if (!user || !storeKey) return EMPTY_USER_PROFILE;
    const { key, profile } = readUserProfileAlongKeys(localChatUserIdLookupKeys(user));
    let fresh = profile;
    if (!fresh.username.trim()) {
      const seededName = passkeyRecordForAddress(user.id)?.username;
      const seeded = seededName ? profileWithSeededUsername(fresh, seededName) : null;
      if (seeded) {
        writeUserProfile(key, seeded);
        fresh = seeded;
      }
    }
    fresh = { ...fresh, locale: readPreferredLocale(fresh.locale) };
    if (cacheRef.current.key === storeKey && shallowEqual(cacheRef.current.value, fresh)) {
      return cacheRef.current.value;
    }
    cacheRef.current = { key: storeKey, value: fresh };
    return fresh;
  }, [storeKey, user]);

  const profile = useSyncExternalStore(subscribeUserProfile, getSnapshot, () => EMPTY_USER_PROFILE);

  const defaultAvatarUrl = useMemo(
    () => (user ? identiconDataUrl(identiconSeedFromUser(user)) : null),
    [user],
  );

  const avatarUrl = profile.customAvatar ?? defaultAvatarUrl;

  const save = useCallback(
    (next: StoredUserProfile, languageSelected = false): boolean => {
      if (!storeKey) return false;
      const stored = user
        ? readUserProfileAlongKeys(localChatUserIdLookupKeys(user)).profile
        : EMPTY_USER_PROFILE;
      // Saving a bio/avatar must not turn the browser default into a fixed preference.
      if (languageSelected) writePreferredLocale(next.locale);
      const ok = writeUserProfile(storeKey, {
        ...next,
        locale: languageSelected ? next.locale : stored.locale,
      });
      if (ok) cacheRef.current = { key: storeKey, value: next };
      return ok;
    },
    [storeKey, user],
  );

  return { profile, avatarUrl, defaultAvatarUrl, save };
}
