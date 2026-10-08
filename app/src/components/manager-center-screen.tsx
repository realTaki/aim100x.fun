import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, Sparkles } from "lucide-react";
import { HubHeader } from "@/components/hub-header";
import { EmptyState } from "@/components/empty-state";
import { IdolPlazaCard } from "@/components/idol-plaza-card";
import { SubscribedEmpty } from "@/components/subscribed-empty";
import { pushActionError } from "@/lib/action-error";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listManagerIdols, type ManagerHub } from "@/lib/idol-catalog";
import { amateurMintIdol } from "@/lib/idol-amateur";
import { mintIdolOnChain } from "@/lib/idol-manager-onchain";
import { usePayAction } from "@/lib/use-pay-action";
import { walletAddressFromUser } from "@/lib/user-profile/wallet-address";

export function ManagerCenterScreen() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [hub, setHub] = useState<ManagerHub | null>(null);
  const mintPay = usePayAction();

  const wallet = user ? walletAddressFromUser(user) : null;

  const refreshHub = useCallback(
    (force = false) => {
      if (!wallet) {
        setHub({ owned: [], nextAmateur: null });
        return;
      }
      void listManagerIdols({ data: { wallet, force } })
        .then((next) => {
          setHub(next);
        })
        .catch(() => pushActionError("Couldn't load. Try again later."));
    },
    [wallet],
  );

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      void navigate({ to: "/login", search: { next: "/me/manager" } });
      return;
    }
    refreshHub(false);
  }, [user, isPending, navigate, refreshHub]);

  function mintAmateur() {
    void mintPay
      .run(async () => {
        await mintIdolOnChain();
      })
      .then((result) => {
        if (result === "done" || result === "idle") refreshHub(true);
      });
  }

  const owned = hub?.owned ?? [];
  const nextAmateur = hub?.nextAmateur ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HubHeader>
        <div className="flex-1" />
        <Link
          to="/me/manager/agent"
          className="lf-icon-btn text-accent"
          aria-label="Manage agent account"
        >
          <span className="flex items-center gap-0.5" aria-hidden>
            <span className="text-sm font-semibold leading-none">+</span>
            <Bot className="size-4" strokeWidth={1.75} />
          </span>
        </Link>
      </HubHeader>

      <section className="lf-hub-scroll flex flex-col gap-3.5">
        {isPending || !user ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="size-10 animate-pulse rounded-full bg-surface-2" />
          </div>
        ) : !wallet ? (
          <EmptyState
            className="mt-8"
            icon={<Sparkles className="size-6 text-muted" />}
            title="Sign in first"
          />
        ) : hub === null ? (
          <div className="mt-12 flex justify-center">
            <div className="size-10 animate-pulse rounded-full bg-surface-2" />
          </div>
        ) : (
          <>
            {nextAmateur ? (
              <IdolPlazaCard
                creator={amateurMintIdol(nextAmateur)}
                priority
                onActivate={() => void mintAmateur()}
                status={mintPay.status}
              />
            ) : null}
            {nextAmateur ? <hr className="m-0 h-px w-full border-0 bg-border" /> : null}
            {owned.length > 0 ? (
              owned.map((creator, i) => (
                <IdolPlazaCard
                  key={creator.tokenId}
                  creator={creator}
                  priority={i === 0 && !nextAmateur}
                  to="/me/manager/$tokenId"
                />
              ))
            ) : (
              <SubscribedEmpty />
            )}
          </>
        )}
      </section>
    </div>
  );
}
