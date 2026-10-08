const STORAGE_PREFIX = "lonelyfuns.user-profile.v1";

export type StoredUserProfile = {
  username: string;
  bio: string;
  /** Custom avatar data URL; null = use wallet identicon. */
  customAvatar: string | null;
  /** Prefer language (BCP 47, e.g. zh-CN). Chat init only — not a later-turn lock. */
  locale: string;
};

export const EMPTY_USER_PROFILE: StoredUserProfile = {
  username: "",
  bio: "",
  customAvatar: null,
  locale: "",
};

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function readUserProfile(userId: string): StoredUserProfile {
  if (typeof window === "undefined") return { ...EMPTY_USER_PROFILE };
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { ...EMPTY_USER_PROFILE };
    const parsed = JSON.parse(raw) as Partial<StoredUserProfile>;
    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      bio: typeof parsed.bio === "string" ? parsed.bio : "",
      customAvatar:
        parsed.customAvatar === null || typeof parsed.customAvatar === "string"
          ? parsed.customAvatar
          : null,
      locale: typeof parsed.locale === "string" ? parsed.locale : "",
    };
  } catch {
    return { ...EMPTY_USER_PROFILE };
  }
}

export function writeUserProfile(userId: string, profile: StoredUserProfile): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(profile));
    window.dispatchEvent(new CustomEvent("lonelyfuns:user-profile", { detail: { userId } }));
    return true;
  } catch {
    return false;
  }
}

export function subscribeUserProfile(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => onStoreChange();
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(STORAGE_PREFIX)) onStoreChange();
  };
  window.addEventListener("lonelyfuns:user-profile", onCustom);
  window.addEventListener("storage", onStorage);
  window.addEventListener("languagechange", onCustom);
  return () => {
    window.removeEventListener("lonelyfuns:user-profile", onCustom);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("languagechange", onCustom);
  };
}

export function profileWithSeededUsername(
  current: StoredUserProfile,
  username: string,
): StoredUserProfile | null {
  const name = username.trim().replace(/\s+/g, " ").slice(0, 32);
  if (!name || current.username.trim()) return null;
  return { ...current, username: name };
}

export function profileWithSeededLocale(
  current: StoredUserProfile,
  locale: string,
): StoredUserProfile | null {
  const tag = locale.trim();
  if (!tag || current.locale.trim()) return null;
  return { ...current, locale: tag };
}

/** Fill username from signup once; never overwrite a name the fan already set. */
export function seedProfileUsername(userId: string, username: string): boolean {
  if (!userId) return false;
  const next = profileWithSeededUsername(readUserProfile(userId), username);
  if (!next) return false;
  return writeUserProfile(userId, next);
}

/** Fill locale from the browser once; never overwrite a locale already stored. */
export function seedProfileLocale(userId: string, locale: string): boolean {
  if (!userId) return false;
  const next = profileWithSeededLocale(readUserProfile(userId), locale);
  if (!next) return false;
  return writeUserProfile(userId, next);
}

export function profileIsFilled(profile: StoredUserProfile): boolean {
  return Boolean(
    profile.username.trim() || profile.bio.trim() || profile.customAvatar || profile.locale.trim(),
  );
}

/** Read along passkey → wallet keys; copy a legacy wallet profile onto the passkey key. */
export function readUserProfileAlongKeys(keys: string[]): {
  key: string;
  profile: StoredUserProfile;
} {
  const primary = keys[0] ?? "";
  if (!primary) return { key: "", profile: { ...EMPTY_USER_PROFILE } };
  const first = readUserProfile(primary);
  if (profileIsFilled(first)) return { key: primary, profile: first };
  for (const key of keys.slice(1)) {
    const profile = readUserProfile(key);
    if (!profileIsFilled(profile)) continue;
    writeUserProfile(primary, profile);
    return { key: primary, profile };
  }
  return { key: primary, profile: first };
}
