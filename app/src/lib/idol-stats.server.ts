import { monadTransport } from "./monad-rpc.ts";
import { getCache } from "@vercel/functions";
import { createPublicClient, http } from "viem";
import { loadIdolCatalog } from "./idol-catalog.server";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_IDOL_ABI,
  IDOLS100X_RPC_URL,
} from "./idols100x";
import { atomicAmountToUsdc } from "./idol-pricing";
import { IDOL_STATS_REFRESH_MS, type IdolStats } from "./idol-stats";
import { createSnapshotCache, type Snapshot } from "./snapshot-cache";

const client = createPublicClient({
  transport: monadTransport(10143),
});
// Hobby caches can be shared by projects: explicitly include this project,
// chain, collection and schema version. No user/session data is stored here.
const sharedCache = () =>
  getCache({
    namespace: `aim100x.fun:idol-stats:v1:${IDOLS100X_CHAIN_ID}:${IDOLS100X_ADDRESS.toLowerCase()}`,
  });

export const loadIdolStats = createSnapshotCache<IdolStats[]>(
  async (previous) => {
    const catalog = await loadIdolCatalog();
    if (catalog.minted.length === 0) return [];
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const reads = await Promise.allSettled(
      catalog.minted.map(async ({ tokenId }) => {
        // idolOf contains both counters, so each idol needs only one eth_call.
        const view = await client.readContract({
          address: IDOLS100X_ADDRESS,
          abi: IDOLS100X_IDOL_ABI,
          functionName: "idolOf",
          args: [BigInt(tokenId)],
          blockNumber,
        });
        return {
          tokenId,
          subscriberCount: Number(view.subscriberCount),
          receiptsUsdc: atomicAmountToUsdc(view.receiptsUsdc),
        };
      }),
    );
    const rows = new Map((previous ?? []).map((row) => [row.tokenId, row]));
    let successes = 0;
    for (const read of reads) {
      if (read.status === "fulfilled") {
        rows.set(read.value.tokenId, read.value);
        successes++;
      }
    }
    // Never turn an RPC error into a successful zero-valued snapshot.
    if (successes === 0 && rows.size === 0)
      throw new Error("Idol statistics are temporarily unavailable");
    return catalog.minted.flatMap(({ tokenId }) => {
      const row = rows.get(tokenId);
      return row ? [row] : [];
    });
  },
  {
    ttlMs: IDOL_STATS_REFRESH_MS,
    store: {
      get: async () => (await sharedCache().get("snapshot")) as Snapshot<IdolStats[]> | null,
      // Retain stale data for RPC failures; freshness is always limited to 5s.
      set: async (snapshot) => {
        await sharedCache().set("snapshot", snapshot, { ttl: 60, name: "idol-chain-stats" });
      },
    },
  },
);
