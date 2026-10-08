export type Snapshot<T> = { at: number; value: T };
export type SnapshotStore<T> = {
  get: () => Promise<Snapshot<T> | null | undefined>;
  set: (snapshot: Snapshot<T>) => Promise<void>;
};

/** Coalesce concurrent refreshes, with a shared store and local fallback. */
export function createSnapshotCache<T>(
  load: (previous: T | undefined) => Promise<T>,
  {
    ttlMs,
    store,
    now = Date.now,
  }: {
    ttlMs: number;
    store?: SnapshotStore<T>;
    now?: () => number;
  },
) {
  let cached: Snapshot<T> | undefined;
  let pending: Promise<T> | undefined;
  let failure: { at: number; error: unknown } | undefined;
  const fresh = (snapshot: Snapshot<T>) => now() - snapshot.at < ttlMs;
  return function read(): Promise<T> {
    if (cached && fresh(cached)) return Promise.resolve(cached.value);
    if (pending) return pending;
    if (failure && now() - failure.at < ttlMs) return Promise.reject(failure.error);
    pending = (async () => {
      // A cache outage must not prevent a chain read.
      const shared = await store?.get().catch(() => undefined);
      if (shared && (!cached || shared.at > cached.at)) cached = shared;
      if (cached && fresh(cached)) return cached.value;
      let value: T;
      try {
        value = await load(cached?.value);
      } catch (error) {
        if (!cached) {
          failure = { at: now(), error };
          throw error;
        }
        // Stale-if-error: retain known data and retry after the normal interval,
        // rather than hammering an unavailable RPC on every incoming request.
        value = cached.value;
      }
      failure = undefined;
      cached = { at: now(), value };
      await store?.set(cached).catch(() => undefined);
      return value;
    })().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}
