import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid() {
  return crypto.randomUUID();
}

export function hasHan(text: string) {
  return /[\u3400-\u9fff]/.test(text);
}

export function isUnauthorized(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; status?: number; name?: string };
  if (e.status === 401 || e.name === "UnauthorizedError") return true;
  return typeof e.message === "string" && (e.message === "Unauthorized" || e.message.startsWith("Unauthorized"));
}

/** First paint: Thumbnail (`?size=thumb` or a batch thumb URL). Full Image prefetches in the background. */
export function thumbUrl(src: string) {
  if (!src || src.includes("size=thumb") || src.includes(".t.")) return src;
  if (src.startsWith("/api/media/")) {
    return src.includes("?") ? `${src}&size=thumb` : `${src}?size=thumb`;
  }
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("/")) return src;
  return src.replace(/(\.[a-z0-9]+)$/i, ".t$1");
}

