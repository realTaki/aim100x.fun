/** Positive ERC-721 token id from a route/API param. No slug fallback. */
export function parseTokenIdParam(raw: string): number | null {
  const key = raw.trim();
  if (!key || !/^\d+$/.test(key)) return null;
  const n = Number(key);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function tokenIdPath(tokenId: number): string {
  return String(tokenId);
}
