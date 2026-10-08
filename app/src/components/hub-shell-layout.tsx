import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { HubHeader } from "@/components/hub-header";
import { pageOwnsHubHeader } from "@/lib/hub-viewport";

const HUB_WRAP = "lf-hub-shell flex h-full min-h-0 w-full flex-col overflow-hidden";
const HUB_MAIN_SCROLL = "lf-hub-scroll flex flex-col";
const HUB_MAIN_PINNED = "flex min-h-0 flex-1 flex-col overflow-hidden";

/**
 * Shared chrome for hub tabs. Always wraps `<Outlet />` so nested `/me`
 * routes (经纪人中心 ↔ idol editor) do not remount the wallet session tree.
 * `active={false}` uses `display: contents` so full-bleed editor pages keep
 * their own layout.
 *
 * Plaza and the broker hub put logo + actions on one row above the list, so
 * those tabs do not scroll the shell — the list pane does.
 */
export function HubShellLayout({
  children,
  active = true,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pinChrome = active && pageOwnsHubHeader(pathname);
  return (
    <div className={active ? HUB_WRAP : "contents"}>
      {active && !pinChrome ? <HubHeader /> : null}
      <main className={active ? (pinChrome ? HUB_MAIN_PINNED : HUB_MAIN_SCROLL) : "contents"}>
        {children}
      </main>
    </div>
  );
}
