import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getCatalogIdol } from "@/lib/idol-catalog";
import { readFanCache, writeFanCache } from "@/lib/fan-cache";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import { fanSubscribedOnChainClient } from "@/lib/subscribe/fan-membership-client";
import { subscribeToIdol } from "@/lib/subscribe/client";

export function useIdolFan(tokenId: number) {
  const { user, isPending } = useCurrentUserState();
  const [wallet, setWallet] = useState<string | null>(null);
  const [isFan, setIsFan] = useState(false);

  useEffect(() => {
    if (isPending) return;
    void resolveConnectedWallet(user).then(setWallet);
  }, [user, isPending]);

  useEffect(() => {
    if (!wallet) {
      setIsFan(false);
      return;
    }
    const cached = readFanCache(wallet, tokenId);
    if (cached !== undefined) setIsFan(cached);
    void getCatalogIdol({ data: { tokenId } })
      .then((idol) => {
        if (!idol) {
          setIsFan(false);
          return;
        }
        return fanSubscribedOnChainClient(wallet as `0x${string}`, idol.tokenId);
      })
      .then((subscribed) => {
        if (subscribed === undefined) return;
        setIsFan(subscribed);
        writeFanCache(wallet, tokenId, subscribed);
      })
      .catch(() => setIsFan(false));
  }, [wallet, tokenId]);

  return { user, isPending, wallet, isFan, setIsFan };
}

export function useIdolSubscribe(
  tokenId: number,
  _loginNext: string,
  maxAmountAtomic: string,
) {
  const { user, isPending, wallet, isFan, setIsFan } = useIdolFan(tokenId);

  const subscribe = useCallback(async () => {
    if (isFan) return;
    if (isPending) throw new Error("Need wallet");
    const connected = wallet ?? (await resolveConnectedWallet(user));
    if (!connected) throw new Error("Need wallet");
    await subscribeToIdol(tokenId, maxAmountAtomic, user);
    setIsFan(true);
    writeFanCache(connected, tokenId, true);
  }, [isFan, isPending, maxAmountAtomic, setIsFan, tokenId, user, wallet]);

  return { user, isPending, isFan, subscribe };
}
