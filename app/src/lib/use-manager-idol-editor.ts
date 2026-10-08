import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getManagerIdol } from "@/lib/idol-catalog";
import { saveIdolConfig } from "@/lib/idol-manager-config";
import { parseIdolConfig } from "@/lib/idol-config";
import type { Idol } from "@/lib/idols";
import { isIdolManagerWallet } from "@/lib/idol-manager-wallet";
import { fetchIdolTokenOwner, writeIdolPricingOnChain } from "@/lib/idol-manager-onchain";
import {
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
  parseUsdcInput,
  usdcToAtomic,
} from "@/lib/idol-pricing";
import { prefetchFullMedia } from "@/lib/media-cache";
import { walletAddressFromUser } from "@/lib/user-profile/wallet-address";

export function useManagerIdolEditor(tokenId: number | null) {
  const { user, isPending } = useCurrentUserState();
  const wallet = user ? walletAddressFromUser(user) : null;
  const [idol, setIdol] = useState<Idol | null>(null);
  const [missing, setMissing] = useState(false);
  const [owner, setOwner] = useState<`0x${string}` | null>(null);
  const [ownerReady, setOwnerReady] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  const canEdit = !isPending && ownerReady && isIdolManagerWallet(owner, wallet);
  const loading = isPending || (!missing && (!idol || !ownerReady));

  useEffect(() => {
    let cancelled = false;
    setOwner(null);
    setOwnerReady(false);
    setMissing(false);
    setIdol(null);
    if (!tokenId || !wallet) {
      setMissing(true);
      return;
    }
    void getManagerIdol({ data: { tokenId } })
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setMissing(true);
          return;
        }
        setIdol(loaded);
        void prefetchFullMedia(loaded.covers);
        setIsPublic(loaded.isPublic);
        void fetchIdolTokenOwner(loaded.tokenId)
          .then((value) => {
            if (!cancelled) setOwner(value);
          })
          .finally(() => {
            if (!cancelled) setOwnerReady(true);
          });
      })
      .catch(() => {
        if (!cancelled) {
          setMissing(true);
          setOwnerReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tokenId, wallet]);

  async function reloadIdol() {
    if (!tokenId) return;
    const loaded = await getManagerIdol({ data: { tokenId } });
    if (loaded) {
      setIdol(loaded);
      void prefetchFullMedia(loaded.covers);
    }
  }

  async function persistNamed(patch: Partial<Idol>): Promise<void> {
    if (!idol || !canEdit) throw new Error("Can't save");
    const next = { ...idol, ...patch };
    const voice = next.voice.trim();
    const sub = parseUsdcInput(String(next.subscribePriceUsdc)) ?? idolSubscribePriceUsdc(idol);
    const img = parseUsdcInput(String(next.imageUnlockPriceUsdc)) ?? idolImageUnlockPriceUsdc(idol);
    if (sub !== idolSubscribePriceUsdc(idol) || img !== idolImageUnlockPriceUsdc(idol)) {
      await writeIdolPricingOnChain(idol.tokenId, {
        subscribePriceUsdc: usdcToAtomic(sub),
        imageUnlockPriceUsdc: usdcToAtomic(img),
      });
    }
    await saveIdolConfig({
      data: { tokenId: idol.tokenId, config: parseIdolConfig({ ...next, voice }) },
    });
    await reloadIdol();
  }

  async function persistPublic(next: boolean): Promise<void> {
    if (!idol || !canEdit) throw new Error("Can't save");
    await saveIdolConfig({
      data: { tokenId: idol.tokenId, config: parseIdolConfig({ ...idol, isPublic: next }) },
    });
    setIdol({ ...idol, isPublic: next });
    setIsPublic(next);
  }

  return {
    idol,
    missing,
    loading,
    canEdit,
    wallet,
    persistNamed,
    persistPublic,
    reloadIdol,
    isPublic,
  };
}
