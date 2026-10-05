import { cn } from "@/lib/utils";

/** Pornhub-style wordmark: msgs (foreground) + fun (white on purple pill). */
export function LfLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 font-extrabold leading-none tracking-tight select-none",
        className,
      )}
      aria-label="aim100x.fun"
    >
      <span className="text-[1.35em] text-fg">msgs</span>
      <span
        className="rounded-md bg-accent px-[0.35em] py-[0.12em] text-[1.35em] text-white shadow-[0_2px_12px_rgb(192_38_255_/_0.35)]"
      >
        fun
      </span>
    </div>
  );
}
