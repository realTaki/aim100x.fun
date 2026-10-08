import type { Idol } from "./idols";

export const IDOL_STATS_REFRESH_MS = 5_000;
export type IdolStats = Pick<Idol, "tokenId" | "subscriberCount" | "receiptsUsdc">;

export function applyIdolStats(idols: Idol[], stats: IdolStats[]): Idol[] {
  const byId = new Map(stats.map((row) => [row.tokenId, row]));
  return idols.map((idol) => {
    const latest = byId.get(idol.tokenId);
    return latest
      ? { ...idol, subscriberCount: latest.subscriberCount, receiptsUsdc: latest.receiptsUsdc }
      : idol;
  });
}
