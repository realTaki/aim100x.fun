import type { ReactNode } from "react";
import { LfLogo } from "@/components/lf-logo";

/** One header geometry for all four tabs; pages supply only their controls. */
export function HubHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 bg-bg pb-3">
      <LfLogo className="shrink-0 text-[0.72rem] sm:text-sm" />
      {children}
    </header>
  );
}
