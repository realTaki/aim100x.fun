import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell, X } from "lucide-react";
import { isPrivacyUnlocked, subscribePrivacyLock } from "@/lib/privacy-pin";
import { clearActionError, getActionError, subscribeActionError } from "@/lib/action-error";

export function ActionErrorBell() {
  const unlocked = useSyncExternalStore(subscribePrivacyLock, isPrivacyUnlocked, () => false);
  const message = useSyncExternalStore(subscribeActionError, getActionError, () => null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (message) setOpen(false);
  }, [message]);

  if (!unlocked || !message) return null;

  return (
    <div className="absolute right-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50">
      {open ? (
        <div
          role="alert"
          className="absolute right-0 bottom-12 w-64 rounded-2xl border border-red-400/35 bg-surface/95 p-3 text-sm leading-relaxed text-fg shadow-[0_12px_40px_rgb(0_0_0_/_0.45)] backdrop-blur-md"
        >
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1">{message}</p>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                clearActionError();
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:text-fg"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-11 items-center justify-center rounded-full border border-red-400/40 bg-red-500/20 text-red-300 shadow-[0_8px_24px_rgb(239_68_68_/_0.28)]"
        aria-label={open ? "Hide error" : "View error"}
        aria-expanded={open}
      >
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500/20" aria-hidden />
        <Bell className="relative size-5" strokeWidth={2} />
      </button>
    </div>
  );
}
