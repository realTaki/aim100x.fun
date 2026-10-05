import { LONELYFUNS_VERCEL_ORIGIN } from "./auth/account-host.ts";

/** Fan idol page path. Canonical public URL is `/idol/{tokenId}`. */
export function idolPublicPath(tokenId: number): string {
  return `/idol/${tokenId}`;
}

export function idolPublicUrl(tokenId: number): string {
  return `${LONELYFUNS_VERCEL_ORIGIN}${idolPublicPath(tokenId)}`;
}

export function httpUrlOf(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.href;
  } catch {
    return "";
  }
}

export function twitterUrlOf(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const handle = t.replace(/^@/, "");
  if (/^[A-Za-z0-9_]{1,15}$/.test(handle)) return `https://x.com/${handle}`;
  return httpUrlOf(t);
}

export async function shareIdolUrl(tokenId: number): Promise<"shared" | "copied" | "failed"> {
  const url = idolPublicUrl(tokenId);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "failed";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
