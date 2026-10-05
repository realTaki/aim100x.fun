import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/** Full-bleed page inside the phone frame — agent, album, crop, links. */
export function AppPageShell({
  title,
  onBack,
  backTo,
  children,
  footer,
  bodyClassName,
}: {
  title: string;
  onBack?: () => void;
  backTo?: "/me/manager";
  children: ReactNode;
  footer?: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-header/80 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        {backTo ? (
          <Link to={backTo} className="lf-icon-btn" aria-label="Back">
            <ChevronLeft className="size-7" strokeWidth={2} />
          </Link>
        ) : (
          <button type="button" onClick={onBack} className="lf-icon-btn" aria-label="返回">
            <ChevronLeft className="size-7" strokeWidth={2} />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
      </header>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))]",
          bodyClassName,
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

/** Overlay that fills the app phone frame, not the desktop window. */
export function AppFrameOverlay({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    if (!open) {
      setHost(null);
      return;
    }
    setHost(document.querySelector(".lf-frame") ?? document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open || !host) return null;

  return createPortal(
    <div
      className={
        host === document.body
          ? "fixed inset-0 z-50"
          : "absolute inset-0 z-50"
      }
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    host,
  );
}
