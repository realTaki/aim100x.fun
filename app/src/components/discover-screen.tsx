import { useMemo, useState, type ReactNode } from "react";
import { CircleDollarSign, Search, Users } from "lucide-react";
import { idolSearchText } from "@/lib/idol-fields";
import { type PlazaSort, sortPlazaIdols } from "@/lib/idol-amateur";
import { type Idol } from "@/lib/idols";
import { EmptyPlazaDiscover, EmptyState } from "@/components/empty-state";
import { FanIdolCard } from "@/components/fan-idol-card";
import { HubHeader } from "@/components/hub-header";
import { cn } from "@/lib/utils";
import { useIdolStats } from "@/lib/use-idol-stats";

export function DiscoverScreen({ idols }: { idols: Idol[] }) {
  const liveIdols = useIdolStats(idols);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PlazaSort>("subscribers");

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? liveIdols.filter((c) => idolSearchText(c).includes(q)) : liveIdols;
    return sortPlazaIdols(matched, sort);
  }, [query, liveIdols, sort]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HubHeader>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search idol</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search idol"
            className="lf-search"
          />
        </label>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-pressed={sort === "subscribers"}
            aria-label="sort by subscribers"
            onClick={() => setSort("subscribers")}
            className={cn("lf-icon-btn", sort === "subscribers" && "bg-white/8 text-accent")}
          >
            <PlazaSortMark>
              <Users className="size-4" strokeWidth={1.75} />
            </PlazaSortMark>
          </button>
          <button
            type="button"
            aria-pressed={sort === "receipts"}
            aria-label="sort by receipts"
            onClick={() => setSort("receipts")}
            className={cn("lf-icon-btn", sort === "receipts" && "bg-white/8 text-accent")}
          >
            <PlazaSortMark>
              <CircleDollarSign className="size-4" strokeWidth={1.75} />
            </PlazaSortMark>
          </button>
        </div>
      </HubHeader>

      <section className="lf-hub-scroll flex flex-col gap-2.5">
        {idols.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-8 py-20">
            <EmptyPlazaDiscover />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Search className="size-6 text-muted" />} title="No results" />
        ) : (
          list.map((creator, i) => (
            <FanIdolCard key={creator.tokenId} creator={creator} priority={i === 0} />
          ))
        )}
      </section>
    </div>
  );
}

/** Existing plaza sort glyph with Taki's ⇅ as a lower-right badge, not a replacement. */
function PlazaSortMark({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center" aria-hidden>
      {children}
      <svg
        viewBox="0 0 8 16"
        className="pointer-events-none absolute -right-0.5 -bottom-px h-2.5 w-[0.32rem]"
        fill="none"
      >
        <path
          d="M2.1 13.4V2.7M2.1 2.7 0.7 4.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5.9 2.6v10.7M5.9 13.3 7.3 11.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
