import { stripMediaSizeParam } from "@/lib/media-app-id";

const CACHE_NAME = "lf-media-full";

function fullUrl(src: string): string {
  return stripMediaSizeParam(src);
}

async function openCache(): Promise<Cache | null> {
  if (typeof window === "undefined" || !("caches" in window)) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Prefetch full-res album images into the Cache API (same local-only family as chat OPFS). */
export async function prefetchFullMedia(urls: readonly string[]): Promise<void> {
  const cache = await openCache();
  const unique = [...new Set(urls.map(fullUrl).filter(Boolean))];
  await Promise.all(
    unique.map(async (url) => {
      try {
        if (cache) {
          const hit = await cache.match(url);
          if (hit) return;
        }
        const res = await fetch(url);
        if (!res.ok) return;
        if (cache) await cache.put(url, res.clone());
      } catch {
        /* private mode / offline */
      }
    }),
  );
}

/** Lightbox: blob URL from cache, or the full network URL on miss. */
export async function resolveFullMediaFromCache(
  src: string,
): Promise<{ url: string; revoke?: () => void }> {
  const url = fullUrl(src);
  const cache = await openCache();
  if (!cache) return { url };
  try {
    const hit = await cache.match(url);
    if (!hit) return { url };
    const blob = await hit.blob();
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
  } catch {
    return { url };
  }
}
