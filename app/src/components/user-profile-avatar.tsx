import { cn } from "@/lib/utils";

export function UserProfileAvatar({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      width={36}
      height={36}
      decoding="async"
      className={cn(
        "size-9 shrink-0 rounded-full object-cover ring-1 ring-border/80",
        className,
      )}
    />
  );
}
