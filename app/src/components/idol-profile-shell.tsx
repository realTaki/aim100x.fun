import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { IdolAvatarRing } from "@/components/idol-avatar-ring";
import { IdolOnChainStats } from "@/components/idol-onchain-stats";
import { thumbUrl } from "@/lib/utils";

/** Shared idol homepage chrome — public profile and manager edit stay pixel-aligned. */
export function IdolProfileShell({
  backTo,
  stripSrc,
  avatarSrc,
  onBannerClick,
  onAvatarClick,
  bannerBadge,
  avatarBadge,
  headerRight,
  alert,
  actions,
  name,
  bio,
  links,
  subscriberCount,
  receiptsUsdc,
  album,
  footer,
}: {
  backTo: "/" | "/me/manager";
  stripSrc?: string;
  avatarSrc?: string;
  onBannerClick?: () => void;
  onAvatarClick?: () => void;
  bannerBadge?: ReactNode;
  avatarBadge?: ReactNode;
  headerRight?: ReactNode;
  alert?: ReactNode;
  actions?: ReactNode;
  name: ReactNode;
  bio: ReactNode;
  links?: ReactNode;
  subscriberCount: number;
  receiptsUsdc: number;
  album?: ReactNode;
  footer?: ReactNode;
}) {
  const banner = stripSrc ? (
    <img
      src={thumbUrl(stripSrc)}
      alt=""
      decoding="async"
      fetchPriority="high"
      className="size-full object-cover object-center"
    />
  ) : null;

  return (
    <main className="relative h-full overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="relative">
        <div className="relative aspect-video w-full overflow-hidden bg-surface">
          {onBannerClick ? (
            <button
              type="button"
              onClick={onBannerClick}
              className="size-full"
              aria-label="Edit banner"
            >
              {banner}
            </button>
          ) : (
            banner
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg to-transparent" />
          {bannerBadge}
        </div>
        <Link
          to={backTo}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 z-20 flex size-10 items-center justify-center rounded-full border border-white/10 bg-bg/50 text-fg backdrop-blur-md"
          aria-label="Back"
        >
          <ChevronLeft className="size-7" strokeWidth={2} />
        </Link>
        {headerRight}
        <div className="absolute bottom-0 left-4 z-10 translate-y-1/2">
          <div className="relative">
            {avatarSrc ? (
              <IdolAvatarRing
                src={avatarSrc}
                fetchPriority="high"
                onOpen={onAvatarClick}
                className="size-24 ring-3 ring-bg shadow-[0_8px_28px_rgb(0_0_0_/_0.45)]"
              />
            ) : onAvatarClick ? (
              <button
                type="button"
                onClick={onAvatarClick}
                className="size-24 rounded-full bg-surface-2 ring-3 ring-bg"
                aria-label="Edit avatar"
              />
            ) : (
              <div className="size-24 rounded-full bg-surface-2 ring-3 ring-bg" />
            )}
            {avatarBadge}
          </div>
        </div>
      </div>

      <div className="px-4 pt-2">
        {alert}
        <div className="flex min-h-14 items-end gap-2">
          <div className="w-24 shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 pb-1">
            {actions}
          </div>
        </div>
        {name}
        {bio}
        {links}
        <IdolOnChainStats
          className="mt-2"
          subscriberCount={subscriberCount}
          receiptsUsdc={receiptsUsdc}
        />
      </div>

      {album ? <section className="mt-5 px-2">{album}</section> : null}
      {footer}
    </main>
  );
}
