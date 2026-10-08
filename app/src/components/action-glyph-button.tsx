import type { ReactNode } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { ActionGlyph } from "@/lib/action-glyph";
import { isActionGlyphBusy } from "@/lib/action-glyph";
import { cn } from "@/lib/utils";

export function ActionGlyphIcon({
  status,
  idle,
  className,
}: {
  status: ActionGlyph;
  idle?: ReactNode;
  className?: string;
}) {
  if (status === "pending") {
    return (
      <Loader2 aria-hidden className={cn("size-4 animate-spin", className)} strokeWidth={2.25} />
    );
  }
  if (status === "success") {
    return <Check aria-hidden className={cn("size-5", className)} strokeWidth={2.25} />;
  }
  if (status === "error") {
    return <X aria-hidden className={cn("size-5 text-red-300", className)} strokeWidth={2.5} />;
  }
  return idle ?? null;
}

export function ActionGlyphButton({
  status,
  onClick,
  disabled,
  className,
  iconClassName,
  idleLabel,
  pendingLabel = "Processing",
  successLabel = "Done",
  errorLabel = "Failed",
  children,
}: {
  status: ActionGlyph;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  idleLabel: string;
  pendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  children: ReactNode;
}) {
  const pending = status === "pending";
  const success = status === "success";
  const failed = status === "error";
  const label = pending ? pendingLabel : success ? successLabel : failed ? errorLabel : idleLabel;
  return (
    <button
      type="button"
      disabled={disabled || isActionGlyphBusy(status)}
      onClick={onClick}
      aria-busy={pending}
      aria-live="polite"
      aria-label={label}
      title={label}
      className={cn(className, pending && "cursor-wait")}
    >
      <ActionGlyphIcon status={status} className={iconClassName} idle={children} />
    </button>
  );
}
