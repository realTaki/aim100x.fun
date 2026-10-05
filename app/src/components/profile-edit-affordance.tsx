import type { LucideIcon } from "lucide-react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProfileEditAffordance({
  onClick,
  label,
  icon: Icon = Pencil,
  className,
}: {
  onClick: () => void;
  label: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border border-white/15 bg-bg/70 text-fg shadow-md backdrop-blur-md transition-colors hover:border-accent/40 hover:text-accent",
        className,
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} />
    </button>
  );
}
