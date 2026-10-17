import { useEffect, useState } from "react";
import { IdolGatedPhoto } from "@/components/idol-gated-photo";
import { GatedIdolImage } from "@/components/gated-idol-image";
import { fetchCoverAlbum, type CoverAlbumItem } from "@/lib/cover-album";
import { prefetchFullMedia } from "@/lib/media-cache";
import { cn } from "@/lib/utils";

export function CoverAlbumGrid({
  tokenId,
  refreshKey,
  locked,
  onOpen,
  onActivate,
  onItemClick,
}: {
  tokenId: number;
  refreshKey?: string | number;
  locked?: (fullUrl: string) => boolean;
  onOpen?: (fullUrl: string) => void;
  onActivate?: (fullUrl: string) => void | Promise<void>;
  onItemClick?: () => void;
}) {
  const [items, setItems] = useState<CoverAlbumItem[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchCoverAlbum(tokenId).then((next) => {
      if (!alive) return;
      setItems(next);
      void prefetchFullMedia(next.map((item) => item.fullUrl));
    });
    return () => {
      alive = false;
    };
  }, [tokenId, refreshKey]);

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((item, i) => {
        const cell = (
          <IdolGatedPhoto
            src={item.fullUrl}
            thumbSrc={item.thumbUrl}
            locked={locked?.(item.fullUrl) ?? false}
            onActivate={() => onActivate?.(item.fullUrl)}
            onOpen={() => (onItemClick ? onItemClick() : onOpen?.(item.fullUrl))}
            loading={i < 3 ? "eager" : "lazy"}
            width={320}
            height={480}
            className="size-full"
          />
        );
        if (onItemClick) {
          return (
            <button
              key={item.mediaId}
              type="button"
              onClick={onItemClick}
              className={cn(
                "aspect-portrait overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60",
              )}
            >
              <GatedIdolImage
                src={item.fullUrl}
                thumbSrc={item.thumbUrl}
                locked={false}
                className="size-full"
              />
            </button>
          );
        }
        return (
          <div
            key={item.mediaId}
            className="aspect-portrait overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border/60 transition-transform duration-150 active:scale-[0.98]"
          >
            {cell}
          </div>
        );
      })}
    </div>
  );
}
