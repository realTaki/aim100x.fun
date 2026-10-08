/** BCP 47 from the browser, e.g. `zh-CN`, `en-US`. */
export function readBrowserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.languages?.[0] || navigator.language || "en").trim();
  return normalizeLocale(raw);
}

const PREFERRED_LOCALE_COOKIE = "aim.preferred-locale";

/** Explicit device preference, then an existing profile preference, then the browser. */
export function readPreferredLocale(storedLocale = ""): string {
  if (typeof document !== "undefined") {
    const value = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${PREFERRED_LOCALE_COOKIE}=`))
      ?.slice(PREFERRED_LOCALE_COOKIE.length + 1);
    if (value) {
      try {
        const tag = decodeURIComponent(value);
        if (/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(tag)) return normalizeLocale(tag);
      } catch {
        /* Ignore malformed cookies and use the profile/browser fallback. */
      }
    }
  }
  return storedLocale.trim() ? normalizeLocale(storedLocale) : readBrowserLocale();
}

/** Called only when the user explicitly saves a language selection. */
export function writePreferredLocale(locale: string): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${PREFERRED_LOCALE_COOKIE}=${encodeURIComponent(normalizeLocale(locale))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function normalizeLocale(raw: string): string {
  const trimmed = raw.trim().replace(/_/g, "-");
  if (!trimmed) return "en";
  const [lang, region] = trimmed.split("-");
  const language = (lang || "en").toLowerCase();
  if (!region) return language;
  return `${language}-${region.toUpperCase()}`;
}

export function localesMatch(a: string, b: string): boolean {
  return normalizeLocale(a).toLowerCase() === normalizeLocale(b).toLowerCase();
}

/** English label for the LLM, e.g. `Chinese (zh-CN)`. */
export function localePromptName(locale: string): string {
  const tag = normalizeLocale(locale);
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    const name = dn.of(tag) ?? dn.of(tag.split("-")[0] ?? tag);
    return name ? `${name} (${tag})` : tag;
  } catch {
    return tag;
  }
}

/** Languages shown on the prefer-language profile picker. */
export const PROFILE_LOCALES = [
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "zh-TW", label: "Chinese (Traditional)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "vi", label: "Vietnamese" },
  { value: "th", label: "Thai" },
  { value: "id", label: "Indonesian" },
  { value: "ru", label: "Russian" },
  { value: "ar", label: "Arabic" },
] as const;

export function localeDisplayName(locale: string): string {
  const tag = normalizeLocale(locale);
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(tag) ?? dn.of(tag.split("-")[0] ?? tag) ?? tag;
  } catch {
    return tag;
  }
}

export function profileLocaleOptions(current = ""): { value: string; label: string }[] {
  const list: { value: string; label: string }[] = PROFILE_LOCALES.map((row) => ({
    value: row.value,
    label: row.label,
  }));
  const tag = current.trim() ? normalizeLocale(current) : "";
  if (tag && !list.some((row) => localesMatch(row.value, tag))) {
    list.unshift({ value: tag, label: localeDisplayName(tag) });
  }
  return list;
}
