import { Link } from "@tanstack/react-router";
import { idolBio, idolName } from "@/lib/idol-fields";
import type { Idol } from "@/lib/idols";
import { IdolOnChainStats } from "@/components/idol-onchain-stats";
import { idolDisplayStrip } from "@/lib/profile-album";
import { GatedIdolImage } from "@/components/gated-idol-image";
import { IdolAvatarRing } from "@/components/idol-avatar-ring";
import { IdolGatedPhoto } from "@/components/idol-gated-photo";
import { actionGlyphBadge, isActionGlyphBusy, type ActionGlyph } from "@/lib/action-glyph";
import { useIdolMediaGate } from "@/lib/use-idol-media-gate";

type IdolPlazaCardProps = {
  creator: Idol;
  priority?: boolean;
  /** Default: fan profile `/idol/$tokenId` */
  to?: "/idol/$tokenId" | "/me/manager/$tokenId";
  /** Whole-card action (broker mint slot). Skips navigation. */
  onActivate?: () => void;
  status?: ActionGlyph;
};

export function IdolPlazaCard({
  creator,
  priority = false,
  to = "/idol/$tokenId",
  onActivate,
  status = "idle",
}: IdolPlazaCardProps) {
  const gate = useIdolMediaGate(creator, `/idol/${creator.tokenId}`);
  const strip = idolDisplayStrip(creator);
  const cardImage = strip.src;
  const buyMode = Boolean(onActivate);
  const name = idolName(creator);
  const bio = idolBio(creator);
  const badge = buyMode ? actionGlyphBadge(status) : undefined;
  const linkProps =
    to === "/me/manager/$tokenId"
      ? {
          to: "/me/manager/$tokenId" as const,
          params: { tokenId: String(creator.tokenId) },
        }
      : {
          to: "/idol/$tokenId" as const,
          params: { tokenId: String(creator.tokenId) },
          search: { needFan: false, becomeFan: false },
        };

  const article = (
    <article className="relative h-32 overflow-hidden rounded-2xl bg-surface ring-1 ring-border/80">
      {cardImage ? (
        <div className="absolute inset-0">
          {buyMode ? (
            <GatedIdolImage
              src={cardImage}
              locked={false}
              badge={badge}
              thumb={false}
              upgrade={false}
              className="size-full"
              imgClassName="object-top"
              loading={priority ? "eager" : "lazy"}
              width={430}
              height={128}
            />
          ) : (
            <IdolGatedPhoto
              src={cardImage}
              locked={to === "/idol/$tokenId" && gate.isLocked(cardImage)}
              thumb
              upgrade={false}
              onActivate={() => gate.unlockImage(cardImage)}
              className="size-full"
              imgClassName="object-top"
              loading={priority ? "eager" : "lazy"}
              width={430}
              height={128}
            />
          )}
        </div>
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/55 to-bg/10" />
      <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-bg/80 to-transparent" />
      <div className="relative flex h-full items-center gap-3 p-3">
        <IdolAvatarRing
          src={creator.avatar}
          loading={priority ? "eager" : "lazy"}
          className="size-20 shrink-0 ring-2 ring-avatar-ring shadow-[0_8px_24px_rgb(0_0_0_/_0.35)]"
        />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-tight text-fg">{name}</h2>
          <IdolOnChainStats
            className="mt-1"
            subscriberCount={creator.subscriberCount}
            receiptsUsdc={creator.receiptsUsdc}
          />
          <p className="mt-1 line-clamp-1 text-sm leading-snug text-fg/85">{bio}</p>
        </div>
      </div>
    </article>
  );

  if (buyMode) {
    return (
      <button
        type="button"
        disabled={isActionGlyphBusy(status)}
        onClick={onActivate}
        aria-busy={status === "pending"}
        aria-live="polite"
        aria-label={status === "pending" ? "支付中" : `${name}. ${bio}`}
        className="block w-full rounded-2xl text-left transition-transform duration-150 active:scale-[0.985] disabled:opacity-70"
      >
        {article}
      </button>
    );
  }

  return (
    <Link {...linkProps} className="block rounded-2xl transition-transform duration-150 active:scale-[0.985]">
      {article}
    </Link>
  );
}
