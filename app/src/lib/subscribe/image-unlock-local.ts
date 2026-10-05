const mem = new Map<string, Set<string>>();

function storageKey(wallet: string, tokenId: number) {
  return `lf:unlock:${wallet.toLowerCase()}:${tokenId}`;
}

function loadSet(wallet: string, tokenId: number): Set<string> {
  const k = `${wallet.toLowerCase()}:${tokenId}`;
  const hit = mem.get(k);
  if (hit) return hit;
  const out = new Set<string>();
  try {
    const raw = localStorage.getItem(storageKey(wallet, tokenId));
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (typeof id === "string" && id) out.add(id);
        }
      }
    }
  } catch {
    /* private mode */
  }
  mem.set(k, out);
  return out;
}

function persist(wallet: string, tokenId: number, ids: Set<string>) {
  const k = `${wallet.toLowerCase()}:${tokenId}`;
  mem.set(k, ids);
  try {
    localStorage.setItem(storageKey(wallet, tokenId), JSON.stringify([...ids]));
  } catch {
    /* private mode */
  }
}

export function listLocalUnlockedImageIds(wallet: string, tokenId: number): string[] {
  return [...loadSet(wallet, tokenId)];
}

export function markLocalImageUnlocked(wallet: string, tokenId: number, imageId: string) {
  const ids = loadSet(wallet, tokenId);
  ids.add(imageId);
  persist(wallet, tokenId, ids);
}
