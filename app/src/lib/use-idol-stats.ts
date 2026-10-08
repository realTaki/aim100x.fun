import { useEffect, useMemo, useState } from "react";
import { listIdolStats } from "./idol-catalog";
import { applyIdolStats, IDOL_STATS_REFRESH_MS, type IdolStats } from "./idol-stats";
import type { Idol } from "./idols";

/** One shared statistics request for the entire visible plaza, not per card. */
export function useIdolStats(idols: Idol[]): Idol[] {
  const [stats, setStats] = useState<IdolStats[]>([]);
  useEffect(() => {
    let stopped = false;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const next = await listIdolStats();
        if (!stopped) setStats(next);
      } catch {
        // Keep the last successful counters when the network/RPC is unavailable.
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, IDOL_STATS_REFRESH_MS);
    const onVisible = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return useMemo(() => applyIdolStats(idols, stats), [idols, stats]);
}
