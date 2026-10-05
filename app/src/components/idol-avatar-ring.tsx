import type { ImgHTMLAttributes } from "react";
import { GatedIdolImage } from "@/components/gated-idol-image";
import { cn } from "@/lib/utils";

type IdolAvatarRingProps = {
  src?: string | null;
  className?: string;
  onOpen?: () => void;
} & Pick<ImgHTMLAttributes<HTMLImageElement>, "loading" | "decoding" | "fetchPriority">;

/** Ring paints `?size=thumb` and stays there. Tap (`onOpen`) loads full. */
export function IdolAvatarRing({
  src,
  className,
  onOpen,
  loading,
  decoding = "async",
  fetchPriority,
}: IdolAvatarRingProps) {
  const ring = src ? (
    <GatedIdolImage
      src={src}
      locked={false}
      thumb
      upgrade={false}
      className="size-full"
      imgClassName="rounded-full"
      width={96}
      height={96}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
    />
  ) : (
    <div className="size-full rounded-full bg-surface-2" />
  );

  const wrapClass = cn("overflow-hidden rounded-full", className);

  if (src && onOpen) {
    return (
      <button type="button" onClick={onOpen} className={wrapClass} aria-label="Open avatar">
        {ring}
      </button>
    );
  }

  return <div className={wrapClass}>{ring}</div>;
}
