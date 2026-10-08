import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FanIdolCard } from "@/components/fan-idol-card";
import { SubscribedEmpty } from "@/components/subscribed-empty";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Idol } from "@/lib/idols";
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
          <FanIdolCard key={creator.tokenId} creator={creator} priority={i === 0} />
        ))
      )}
    </section>
  );
}
