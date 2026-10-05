const mem = new Map<string, boolean>();

function key(userId: string, tokenId: number) {
  return `${userId}:${tokenId}`;
}

export function readFanCache(userId: string, tokenId: number): boolean | undefined {
  const k = key(userId, tokenId);
  const hit = mem.get(k);
  if (hit !== undefined) return hit;
  try {
    const v = sessionStorage.getItem(`lf:fan:${k}`);
    if (v === "1") {
      mem.set(k, true);
      return true;
    }
    if (v === "0") {
      mem.set(k, false);
      return false;
    }
  } catch {
    /* private mode */
  }
  return undefined;
}

export function writeFanCache(userId: string, tokenId: number, isFan: boolean) {
  const k = key(userId, tokenId);
  mem.set(k, isFan);
  try {
    sessionStorage.setItem(`lf:fan:${k}`, isFan ? "1" : "0");
  } catch {
    /* private mode */
  }
}
