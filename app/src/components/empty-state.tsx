import type { ReactNode } from "react";
import { Leaf, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY_SPARKLES = (
  <>
    <path
      d="M154 22l9-15"
      stroke="#9a93a8"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M166 34l16-6"
      stroke="#9a93a8"
      strokeWidth="5"
      strokeLinecap="round"
    />
    <path
      d="M168 50l15 6"
      stroke="#9a93a8"
      strokeWidth="5"
      strokeLinecap="round"
    />
  </>
);

/**
 * Open folder with a heart — same mark as the 收藏夹 empty illustration,
 * restyled to the dark-purple hub.
 */
export function EmptyCollectionFolder({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 188 140"
      className={cn("h-[7.25rem] w-[9.75rem]", className)}
      fill="none"
      aria-hidden
    >
      <path
        d="M22 40h30l9 9h58a16 16 0 0 1 16 16v46a16 16 0 0 1-16 16H38a16 16 0 0 1-16-16V40Z"
        fill="#5a5370"
      />
      <path
        d="M22 40V28a12 12 0 0 1 12-12h28c3.6 0 6.9 1.8 8.8 4.8L82 40"
        fill="#5a5370"
      />
      <rect x="50" y="48" width="118" height="80" rx="18" fill="#c4c0cc" />
      <path
        d="M109 100.4 106.9 98.5C99.3 91.7 94.4 87.2 94.4 81.7c0-4.5 3.5-8 8-8 2.5 0 4.9 1.2 6.6 3.1 1.7-1.9 4.1-3.1 6.6-3.1 4.5 0 8 3.5 8 8 0 5.5-4.9 10-12.5 16.8L109 100.4Z"
        fill="#c026ff"
        opacity="0.72"
      />
      {EMPTY_SPARKLES}
    </svg>
  );
}

/**
 * Plaza / discover empty: open map with a pin.
 * Illustration-scale like EmptyCollectionFolder — not the tab compass, not a folder.
 */
export function EmptyPlazaDiscover({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 188 140"
      className={cn("h-[7.25rem] w-[9.75rem]", className)}
      fill="none"
      aria-hidden
    >
      <g transform="rotate(-8 78 118)">
        <rect x="18" y="52" width="70" height="82" rx="14" fill="#5a5370" />
        <rect x="22" y="44" width="66" height="82" rx="14" fill="#c4c0cc" />
        <path
          d="M36 66h36M36 80h28M36 94h32"
          stroke="#5a5370"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.28"
        />
        <circle cx="40" cy="108" r="4" fill="#5a5370" opacity="0.32" />
      </g>
      <g transform="rotate(8 110 118)">
        <rect x="96" y="52" width="70" height="82" rx="14" fill="#5a5370" />
        <rect x="96" y="44" width="66" height="82" rx="14" fill="#c4c0cc" />
        <path
          d="M110 68h34M110 82h26M110 96h30"
          stroke="#5a5370"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.28"
        />
        <path
          d="M112 110c10-10 16-4 28-16"
          stroke="#5a5370"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.35"
        />
      </g>
      <path
        d="M78 38c0-8.8 7.2-16 16-16s16 7.2 16 16c0 12-16 28-16 28S78 50 78 38Z"
        fill="#c026ff"
        opacity="0.72"
      />
      <circle cx="94" cy="36" r="7" fill="#c4c0cc" />
      {EMPTY_SPARKLES}
    </svg>
  );
}

/**
 * Chat-history photos empty: stacked polaroids with a no-image well.
 * Illustration-scale like EmptyCollectionFolder — not the lucide ImageIcon.
 */
export function EmptyChatPhotos({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 188 140"
      className={cn("h-[7.25rem] w-[9.75rem]", className)}
      fill="none"
      aria-hidden
    >
      <g transform="rotate(-10 64 118)">
        <rect x="18" y="46" width="78" height="90" rx="14" fill="#5a5370" />
        <rect x="26" y="54" width="62" height="56" rx="8" fill="#3f3a52" />
      </g>
      <g transform="rotate(7 118 118)">
        <rect x="86" y="34" width="86" height="100" rx="16" fill="#c4c0cc" />
        <rect x="96" y="44" width="66" height="62" rx="8" fill="#5a5370" />
        <circle cx="142" cy="62" r="7" fill="#c026ff" opacity="0.72" />
        <path
          d="M104 98l14-20 11 12 11-16 18 24"
          stroke="#c4c0cc"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.4"
        />
      </g>
      {EMPTY_SPARKLES}
    </svg>
  );
}

/** Wind + fallen leaves. Icon-only empty catalog. */
export function EmptyLeavesIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block size-7", className)}>
      <Wind className="size-7 text-muted" strokeWidth={1.6} aria-hidden />
      <Leaf
        className="absolute -top-0.5 right-[-3px] size-3.5 rotate-[48deg] text-muted/85"
        strokeWidth={2}
        aria-hidden
      />
      <Leaf
        className="absolute -bottom-0.5 left-[-2px] size-3 -rotate-[38deg] text-muted/65"
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  className,
}: {
  icon: ReactNode;
  title?: string;
  hint?: string;
  className?: string;
}) {
  const hasCopy = Boolean(title || hint);
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-8 py-20 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-2xl bg-surface-2 ring-1 ring-border shadow-[0_0_32px_rgb(192_38_255_/_0.12)]",
          hasCopy && "mb-4",
        )}
      >
        {icon}
      </div>
      {title ? (
        <p className="text-base font-medium tracking-tight text-fg">{title}</p>
      ) : null}
      {hint ? (
        <p className="mt-1.5 max-w-[17rem] text-sm leading-relaxed text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
