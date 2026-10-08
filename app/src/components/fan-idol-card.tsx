import { IdolPlazaCard } from "@/components/idol-plaza-card";
import type { Idol } from "@/lib/idols";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import { isFanOfTokenId } from "@/lib/subscribe/fan-status-client";
import { writeFanCache } from "@/lib/fan-cache";

/** Shared fan card and membership prefetch for plaza and subscriptions. */
export function FanIdolCard({ creator, priority }: { creator: Idol; priority: boolean }) {
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
