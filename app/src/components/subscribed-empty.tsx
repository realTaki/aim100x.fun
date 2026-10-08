import { Link } from "@tanstack/react-router";
import { PlazaTabIcon } from "@/components/bottom-glass-tab-bar";
import { EmptyCollectionFolder } from "@/components/empty-state";

/** Folder-heart illustration + compass pill → Explore. No copy. */
export function SubscribedEmpty() {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-20">
      <EmptyCollectionFolder className="mb-6" />
      <Link
        to="/"
        aria-label="Explore"
        className="inline-flex h-10 min-w-28 items-center justify-center rounded-full bg-accent px-5 text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] transition-transform duration-150 active:scale-[0.98]"
      >
        <PlazaTabIcon className="size-5" strokeWidth={1.75} fill="none" aria-hidden />
      </Link>
    </div>
  );
}
