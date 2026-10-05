/** BCP 47 from the browser, e.g. `zh-CN`, `en-US`. */
export function readBrowserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.languages?.[0] || navigator.language || "en").trim();
  return normalizeLocale(raw);
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
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt-BR", label: "Português" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "th", label: "ไทย" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
] as const;

export function localeNativeName(locale: string): string {
  const tag = normalizeLocale(locale);
  try {
    const dn = new Intl.DisplayNames([tag], { type: "language" });
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
    list.unshift({ value: tag, label: localeNativeName(tag) });
  }
  return list;
}
