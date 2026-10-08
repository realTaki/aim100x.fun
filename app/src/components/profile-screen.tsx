import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, Mail, ShoppingBag } from "lucide-react";
import { PayActionButton } from "@/components/pay-action-button";
import { usePayAction } from "@/lib/use-pay-action";
import { idolBio, idolName } from "@/lib/idol-fields";
import { idolPublicPath } from "@/lib/idol-links";
import type { Idol } from "@/lib/idols";
import { formatUsdcPrice } from "@/lib/idol-pricing";
import { idolDisplayStrip } from "@/lib/profile-album";
import { CoverAlbumGrid } from "@/components/cover-album-grid";
import { IdolLinkButtons } from "@/components/idol-link-buttons";
import { IdolProfileShell } from "@/components/idol-profile-shell";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIdolMediaGate } from "@/lib/use-idol-media-gate";
import { buyIdolOnChain } from "@/lib/idol-manager-onchain";
import { cn } from "@/lib/utils";

export function ProfileScreen({ creator }: { creator: Idol }) {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const wantSubscribe = useRef(false);
  const loginNext = idolPublicPath(creator.tokenId);
  const subscribePay = usePayAction();
  const buyPay = usePayAction();
  const salePrice = creator.salePriceUsdc > 0 ? creator.salePriceUsdc : 0;
  const gate = useIdolMediaGate(creator, loginNext);
  const { isFan, subscribe, subscribePriceLabel, isLocked, unlockImage } = gate;
  const strip = idolDisplayStrip(creator);

  useEffect(() => {
    if (!wantSubscribe.current || isPending) return;
    wantSubscribe.current = false;
    if (!user) {
      void navigate({ to: "/login", search: { next: loginNext } });
      return;
    }
    void subscribePay.run(subscribe);
  }, [isPending, loginNext, navigate, subscribe, subscribePay, user]);

  function onSubscribeClick() {
    if (isFan || subscribePay.status === "pending") return;
    if (isPending) {
      wantSubscribe.current = true;
      return;
    }
    if (!user) {
      void navigate({ to: "/login", search: { next: loginNext } });
      return;
    }
    void subscribePay.run(subscribe);
  }

  const subscribeLabel = `Subscribe ${subscribePriceLabel}`;
  const showDm = isFan && subscribePay.status !== "pending" && subscribePay.status !== "success";
  const showBuy = salePrice > 0 && buyPay.status !== "done";
  const buyLabel = formatUsdcPrice(salePrice);
  const subscribeBtnClass = cn(
    "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-accent px-3 text-sm font-medium text-fg shadow-[0_8px_24px_rgb(192_38_255_/_0.28)] disabled:opacity-70",
  );
  const buyBtnClass =
    "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-accent/50 bg-surface-2 px-3 text-sm font-medium text-fg disabled:opacity-70";

  return (
    <IdolProfileShell
      backTo="/"
      stripSrc={strip.src}
      avatarSrc={creator.avatar}
      onAvatarClick={() => setLightbox(creator.avatar)}
      headerRight={
        <IdolLinkButtons
          tokenId={creator.tokenId}
          className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-20"
        />
      }
      actions={
        <>
          {showDm ? (
            <Link
              to="/chat/$tokenId"
              params={{ tokenId: String(creator.tokenId) }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg ring-1 ring-border transition-colors hover:bg-surface-3"
              aria-label="Message"
              title="Message"
            >
              <Mail className="size-4" strokeWidth={1.75} aria-hidden />
            </Link>
          ) : !user && !isPending ? (
            <Link
              to="/login"
              search={{ next: loginNext }}
              aria-label={subscribeLabel}
              title={subscribeLabel}
              className={subscribeBtnClass}
            >
              <Heart aria-hidden className="size-5" strokeWidth={1.75} />
              {subscribePriceLabel}
            </Link>
          ) : (
            <PayActionButton
              status={subscribePay.status === "done" ? "idle" : subscribePay.status}
              onClick={onSubscribeClick}
              idleLabel={subscribeLabel}
              className={subscribeBtnClass}
            >
              <Heart aria-hidden className="size-5" strokeWidth={1.75} />
              {subscribePriceLabel}
            </PayActionButton>
          )}
          {showBuy ? (
            !user && !isPending ? (
              <Link
                to="/login"
                search={{ next: loginNext }}
                aria-label={buyLabel}
                title={buyLabel}
                className={buyBtnClass}
              >
                <ShoppingBag aria-hidden className="size-5" strokeWidth={1.75} />
                {buyLabel}
              </Link>
            ) : (
              <PayActionButton
                status={buyPay.status}
                onClick={() => {
                  if (!user) {
                    void navigate({ to: "/login", search: { next: loginNext } });
                    return;
                  }
                  void buyPay.run(() => buyIdolOnChain(creator.tokenId).then(() => undefined));
                }}
                idleLabel={buyLabel}
                className={buyBtnClass}
              >
                <ShoppingBag aria-hidden className="size-5" strokeWidth={1.75} />
                {buyLabel}
              </PayActionButton>
            )
          ) : null}
        </>
      }
      name={
        <h1 className="mt-2 break-words text-2xl leading-tight font-semibold tracking-tight">
          {idolName(creator)}
        </h1>
      }
      bio={<p className="mt-3 text-md leading-relaxed text-fg/88">{idolBio(creator)}</p>}
      links={
        <IdolLinkButtons
          website={creator.website}
          twitter={creator.twitter}
          tokenId={creator.tokenId}
          share={false}
          compact
          className="mt-3"
        />
      }
      subscriberCount={creator.subscriberCount}
      receiptsUsdc={creator.receiptsUsdc}
      album={
        <CoverAlbumGrid
          tokenId={creator.tokenId}
          refreshKey={creator.covers.join()}
          locked={isLocked}
          onActivate={(src) => unlockImage(src)}
          onOpen={(src) => setLightbox(src)}
        />
      }
      footer={lightbox ? <PhotoLightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    />
  );
}
