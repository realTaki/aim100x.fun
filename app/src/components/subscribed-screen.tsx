import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IdolPlazaCard } from "@/components/idol-plaza-card";
import { SubscribedEmpty } from "@/components/subscribed-empty";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Idol } from "@/lib/idols";
import { writeFanCache } from "@/lib/fan-cache";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import { isFanOfTokenId } from "@/lib/subscribe/fan-status-client";
import { loadSubscribedIdolsForFan } from "@/lib/subscribe/subscribed-idols-client";

export function SubscribedScreen() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [idols, setIdols] = useState<Idol[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      void navigate({ to: "/login", search: { next: "/subscribed" } });
      return;
    }
    setLoading(true);
    void loadSubscribedIdolsForFan(user)
      .then((list) => setIdols(list))
      .catch(() => setIdols([]))
      .finally(() => setLoading(false));
  }, [user, isPending, navigate]);

  return (
    <section className="mt-5 flex flex-col gap-3.5">
      {loading || isPending ? (
        <div className="flex justify-center py-16">
          <div className="size-10 animate-pulse rounded-full bg-surface-2" />
        </div>
      ) : idols.length === 0 ? (
        <SubscribedEmpty />
      ) : (
        idols.map((creator, i) => (
          <SubscribedIdolCard key={creator.tokenId} creator={creator} priority={i === 0} />
        ))
      )}
    </section>
  );
}

function SubscribedIdolCard({ creator, priority }: { creator: Idol; priority: boolean }) {
  const { user } = useCurrentUserState();
  return (
    <div
      onPointerDown={() => {
        if (!user) return;
        void resolveConnectedWallet(user)
          .then((wallet) =>
            wallet
              ? isFanOfTokenId(creator.tokenId, wallet).then((isFan) =>
                  writeFanCache(wallet, creator.tokenId, isFan),
                )
              : undefined,
          )
          .catch(() => {});
      }}
    >
      <IdolPlazaCard creator={creator} priority={priority} />
    </div>
  );
}
