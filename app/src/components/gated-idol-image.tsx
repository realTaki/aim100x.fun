import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { Lock } from "lucide-react";
import { ActionGlyphIcon } from "@/components/action-glyph-button";
import { prefetchFullMedia } from "@/lib/media-cache";
import type { ActionGlyphBadge } from "@/lib/action-glyph";
import { cn, thumbUrl } from "@/lib/utils";

type GateBadge = "lock" | ActionGlyphBadge;

type GatedIdolImageProps = {
  src: string;
  locked: boolean;
  badge?: GateBadge;
  className?: string;
  imgClassName?: string;
  /** Paint Thumbnail first. Default on — every image is thumb-first. */
  thumb?: boolean;
  /** Optional already-resolved thumb URL (cover-album batch). */
  thumbSrc?: string;
  /** Swap the visible img to full after load. Default off; full goes to cache. */
  upgrade?: boolean;
} & Pick<ImgHTMLAttributes<HTMLImageElement>, "width" | "height" | "loading" | "decoding" | "fetchPriority" | "onLoad" | "alt">;

export function GatedIdolImage({
  src,
  locked,
  badge,
  className,
  imgClassName,
  thumb = true,
  thumbSrc,
  upgrade = false,
  alt = "",
  ...imgProps
}: GatedIdolImageProps) {
  const preview = thumb ? (thumbSrc || thumbUrl(src)) : src;
  const [displaySrc, setDisplaySrc] = useState(preview);

  useEffect(() => {
    setDisplaySrc(preview);
    if (!thumb || !upgrade || preview === src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDisplaySrc(src);
    };
    img.src = src;
    return () => {
      cancelled = true;
      img.onload = null;
    };
  }, [preview, src, thumb, upgrade]);

  useEffect(() => {
    if (!src) return;
    void prefetchFullMedia([src]);
  }, [src]);

  const overlay = badge ?? (locked ? "lock" : null);
  const blurred = locked || overlay === "pending" || overlay === "success" || overlay === "error";

  return (
    <div className={cn("relative size-full overflow-hidden", className)}>
      <img
        src={displaySrc}
        alt={alt}
        {...imgProps}
        className={cn(
          "size-full object-cover transition-[filter]",
          blurred && "scale-110 blur-2xl brightness-90",
          imgClassName,
        )}
      />
      {overlay ? (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-fg/10 backdrop-blur-md"
          aria-hidden
        >
          {overlay === "lock" ? (
            <Lock className="size-8 text-white/70" strokeWidth={2} />
          ) : (
            <ActionGlyphIcon
              status={overlay}
              className="size-8 drop-shadow-[0_2px_8px_rgb(0_0_0_/_0.45)]"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
