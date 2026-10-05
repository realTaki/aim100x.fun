import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { resolveFullMediaFromCache } from "@/lib/media-cache";

export function PhotoLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const [display, setDisplay] = useState(src);

  useEffect(() => {
    let revoke: (() => void) | undefined;
    let alive = true;
    setDisplay(src);
    void resolveFullMediaFromCache(src).then((hit) => {
      if (!alive) {
        hit.revoke?.();
        return;
      }
      setDisplay(hit.url);
      revoke = hit.revoke;
    });
    return () => {
      alive = false;
      revoke?.();
    };
  }, [src]);

  return (
    <button
      type="button"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/92 p-4 backdrop-blur-md"
      onClick={onClose}
      aria-label="Close photo"
    >
      <img
        src={display}
        alt=""
        className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_24px_80px_rgb(0_0_0_/_0.55)]"
      />
      <span className="absolute bottom-6 left-1/2 flex size-12 -translate-x-1/2 items-center justify-center rounded-full bg-close text-bg shadow-lg">
        <X className="size-6" strokeWidth={2.5} />
      </span>
    </button>
  );
}
