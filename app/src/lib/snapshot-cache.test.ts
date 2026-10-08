import assert from "node:assert/strict";
import { it } from "node:test";
import { createSnapshotCache, type Snapshot } from "./snapshot-cache.ts";
import { applyIdolStats, IDOL_STATS_REFRESH_MS } from "./idol-stats.ts";

it("shares one refresh across concurrent callers and refreshes exactly after five seconds", async () => {
  let time = 0;
  let calls = 0;
  let finish!: (value: number) => void;
  const read = createSnapshotCache(
    () => {
      calls++;
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    },
    { ttlMs: IDOL_STATS_REFRESH_MS, now: () => time },
  );
  const first = read();
  const second = read();
  await Promise.resolve();
  assert.equal(calls, 1);
  finish(1);
  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  time = 4_999;
  assert.equal(await read(), 1);
  assert.equal(calls, 1);
  time = 5_000;
  const refresh = read();
  await Promise.resolve();
  assert.equal(calls, 2);
  finish(2);
  assert.equal(await refresh, 2);
});

it("reuses the shared snapshot in a second function instance, including after local expiry", async () => {
  let time = 0;
  let calls = 0;
  let shared: Snapshot<number> | undefined;
  const store = {
    get: async () => shared,
    set: async (value: Snapshot<number>) => {
      shared = value;
    },
  };
  const load = async () => ++calls;
  const options = { ttlMs: IDOL_STATS_REFRESH_MS, now: () => time, store };
  const a = createSnapshotCache(load, options);
  const b = createSnapshotCache(load, options);
  assert.equal(await a(), 1);
  assert.equal(await b(), 1);
  time = 5_000;
  assert.equal(await a(), 2);
  assert.equal(await b(), 2);
  assert.equal(calls, 2);
});

it("keeps last known data on RPC failure and waits five seconds before retrying", async () => {
  let time = 0;
  let calls = 0;
  const read = createSnapshotCache(
    async () => {
      calls++;
      if (calls === 2) throw new Error("RPC limited");
      return calls;
    },
    { ttlMs: IDOL_STATS_REFRESH_MS, now: () => time },
  );
  assert.equal(await read(), 1);
  time = 5_000;
  assert.equal(await read(), 1);
  time = 5_001;
  assert.equal(await read(), 1);
  assert.equal(calls, 2);
  time = 10_000;
  assert.equal(await read(), 3);
});

it("does not cache fabricated data after a cold-start failure, and cache-store outages do not block reads", async () => {
  let calls = 0;
  let time = 0;
  const read = createSnapshotCache(
    async () => {
      if (++calls === 1) throw new Error("RPC limited");
      return 7;
    },
    {
      ttlMs: IDOL_STATS_REFRESH_MS,
      now: () => time,
      store: {
        get: async () => {
          throw new Error("Cache unavailable");
        },
        set: async () => {
          throw new Error("Cache unavailable");
        },
      },
    },
  );
  await assert.rejects(read(), /RPC limited/);
  await assert.rejects(read(), /RPC limited/);
  assert.equal(calls, 1);
  time = 5_000;
  assert.equal(await read(), 7);
  assert.equal(await read(), 7);
  assert.equal(calls, 2);
});

it("updates all plaza counters by token id without clearing cards whose chain reads failed", async () => {
  const { mintedIdolsFromConstants } = await import("./idols100x-chain.server.ts");
  const idols = mintedIdolsFromConstants().map((row) => ({
    ...row,
    avatar: "",
    covers: [],
    banner: "",
    photos: [],
    scenePhotoUrls: {},
    mediaContentRating: {},
  }));
  idols[2]!.subscriberCount = 7;
  const first = idols[0]!;
  const second = idols[1]!;
  const next = applyIdolStats(idols, [
    { tokenId: second.tokenId, subscriberCount: 1, receiptsUsdc: 2 },
    { tokenId: first.tokenId, subscriberCount: 1, receiptsUsdc: 3 },
  ]);
  assert.equal(next[0]!.subscriberCount, 1);
  assert.equal(next[1]!.subscriberCount, 1);
  assert.equal(next[0]!.receiptsUsdc, 3);
  assert.equal(next[1]!.receiptsUsdc, 2);
  assert.equal(next[2], idols[2]);
  assert.equal(next[2]!.subscriberCount, 7);
  assert.equal(idols[0]!.subscriberCount, first.subscriberCount);
});
