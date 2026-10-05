import { GatedIdolImage } from "@/components/gated-idol-image";
import { actionGlyphBadge } from "@/lib/action-glyph";
import { usePayAction } from "@/lib/use-pay-action";
import { cn } from "@/lib/utils";

type IdolGatedPhotoProps = {
  src: string;
  locked: boolean;
  className?: string;
  imgClassName?: string;
  thumb?: boolean;
  thumbSrc?: string;
  upgrade?: boolean;
  onActivate?: () => void | Promise<void>;
  onOpen?: () => void;
  loading?: "eager" | "lazy";
  width?: number;
  height?: number;
};

export function IdolGatedPhoto({
  src,
  locked,
  className,
  imgClassName,
  thumb = true,
  thumbSrc,
  upgrade = false,
  onActivate,
  onOpen,
  loading,
  width,
  height,
}: IdolGatedPhotoProps) {
  const pay = usePayAction();
  const handleClick = () => {
    if (pay.status === "pending" || pay.status === "success") return;
    if (locked) {
      void pay.run(async () => {
        await onActivate?.();
      });
      return;
    }
    onOpen?.();
  };

  const badge = actionGlyphBadge(pay.status);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn("relative block size-full overflow-hidden", className)}
      aria-label={locked || badge ? "锁定" : "打开"}
    >
      <GatedIdolImage
        src={src}
        locked={locked}
        badge={badge}
        thumb={thumb}
        thumbSrc={thumbSrc}
        upgrade={upgrade}
        imgClassName={imgClassName}
        loading={loading}
        width={width}
        height={height}
      />
    </button>
  );
}
