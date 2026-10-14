import { cn } from "@/lib/utils";

/** aim100x wordmark with a purple badge inspired by msgs.fun. */
export function LfLogo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-[0.2em] whitespace-nowrap font-extrabold leading-none tracking-tight select-none",
        className,
      )}
      role="img"
      aria-label="aim100x.fun"
    >
      <span aria-hidden="true" className="text-[1.35em] text-white">aim</span>
      <span
        aria-hidden="true"
        className="rounded-[0.35em] bg-gradient-to-b from-[#c183ef] to-[#ae64e4] px-[0.35em] py-[0.22em] text-[1.35em] text-[#190f23] shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.3)]"
      >
        100x
      </span>
    </div>
  );
}
