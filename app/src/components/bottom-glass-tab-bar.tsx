import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Heart, Sparkles, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type BottomGlassTab = "plaza" | "subscribed" | "creator" | "profile";

/** Plaza tab. Compass, not a square grid. */
export const PlazaTabIcon = Compass;

const TABS: {
  id: BottomGlassTab;
  to: string;
  label: string;
  icon: LucideIcon;
  /** Compass is a circle; filling it becomes a purple blob. */
  fillActive?: boolean;
}[] = [
  { id: "plaza", to: "/", label: "广场", icon: PlazaTabIcon, fillActive: false },
  { id: "subscribed", to: "/subscribed", label: "已订阅", icon: Heart },
  { id: "creator", to: "/me/manager", label: "创作者中心", icon: Sparkles },
  { id: "profile", to: "/me", label: "个人主页", icon: User },
];

function normalizeHubPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

/** Routes that show the floating bottom capsule (hub screens only). */
export function bottomGlassTabFromPath(pathname: string): BottomGlassTab | null {
  const path = normalizeHubPath(pathname);
  if (path === "/") return "plaza";
  if (path === "/subscribed") return "subscribed";
  if (path === "/me/manager") return "creator";
  if (path === "/me") return "profile";
  return null;
}

export function shouldShowBottomGlassTabBar(pathname: string): boolean {
  return bottomGlassTabFromPath(pathname) !== null;
}

/** Bottom inset for scrollable main content when the capsule is visible. */
export const BOTTOM_GLASS_TAB_BAR_MAIN_PB =
  "pb-[max(6.75rem,calc(env(safe-area-inset-bottom)+5.75rem))]";

export function BottomGlassTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = bottomGlassTabFromPath(pathname);
  if (!active) return null;

  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
      aria-label="主导航"
    >
      <div className="lf-bottom-glass-capsule pointer-events-auto flex w-full gap-0.5 p-1">
        {TABS.map((tab) => (
          <TabLink
            key={tab.id}
            to={tab.to}
            active={active === tab.id}
            label={tab.label}
            icon={tab.icon}
            fillActive={tab.fillActive}
          />
        ))}
      </div>
    </nav>
  );
}

function TabLink({
  to,
  active,
  label,
  icon: Icon,
  fillActive = true,
}: {
  to: string;
  active: boolean;
  label: string;
  icon: LucideIcon;
  fillActive?: boolean;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      activeProps={{ className: undefined }}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center rounded-full px-1 py-2.5 transition-colors outline-none",
        "focus:outline-none focus-visible:outline-none focus-visible:ring-0",
        active
          ? fillActive
            ? "bg-accent/25 text-accent shadow-[inset_0_0_0_1px_rgb(192_38_255_/_0.35)]"
            : "text-fg"
          : "text-muted hover:text-fg",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-[22px] shrink-0",
          fillActive ? active && "fill-current" : "fill-none",
        )}
        strokeWidth={active ? 2.25 : 1.75}
        fill={fillActive ? undefined : "none"}
      />
    </Link>
  );
}
