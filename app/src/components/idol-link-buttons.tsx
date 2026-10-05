import { useState } from "react";
import { Check, Globe, Share2 } from "lucide-react";
import { httpUrlOf, shareIdolUrl, twitterUrlOf } from "@/lib/idol-links";
import { cn } from "@/lib/utils";

const CIRCLE =
  "flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg/50 text-fg backdrop-blur-md transition-colors hover:bg-bg/70";
const COMPACT_CIRCLE =
  "flex size-8 items-center justify-center rounded-full border border-border/70 bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-fg";

function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="currentColor"
    >
      <path d="M14.2 10.43 20.5 3h-1.7l-5.46 6.46L9.05 3H3.5l6.62 9.64L3.5 21h1.7l5.77-6.83L14.9 21h5.55l-6.25-10.57ZM11.7 13.2l-.67-.96-5.3-7.57h2.28l4.28 6.12.67.96 5.56 7.94h-2.28L11.7 13.2Z" />
    </svg>
  );
}

export function IdolLinkButtons({
  website,
  twitter,
  tokenId,
  share = true,
  compact = false,
  className,
}: {
  website?: string;
  twitter?: string;
  tokenId: number;
  share?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const site = httpUrlOf(website ?? "");
  const tw = twitterUrlOf(twitter ?? "");
  if (!site && !tw && !share) return null;
  const linkClassName = compact ? COMPACT_CIRCLE : CIRCLE;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {site ? (
        <a
          href={site}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          aria-label="Website"
        >
          <Globe className="size-4" strokeWidth={1.75} />
        </a>
      ) : null}
      {tw ? (
        <a
          href={tw}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
          aria-label="Twitter"
        >
          <XMark className="size-4" />
        </a>
      ) : null}
      {share ? <ShareIdolButton tokenId={tokenId} /> : null}
    </div>
  );
}

function ShareIdolButton({ tokenId }: { tokenId: number }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      className={CIRCLE}
      aria-label="Share"
      onClick={() => {
        void shareIdolUrl(tokenId).then((result) => {
          if (result === "failed") return;
          setDone(true);
          window.setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? (
        <Check className="size-4" strokeWidth={2.25} />
      ) : (
        <Share2 className="size-4" strokeWidth={1.75} />
      )}
    </button>
  );
}
