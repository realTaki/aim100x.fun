import { useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getManagerIdol } from "@/lib/idol-catalog";
import { scenesJsonOf } from "@/lib/idol-fields";
import type { Idol } from "@/lib/idols";
import { isIdolManagerWallet } from "@/lib/idol-manager-wallet";
import {
  fetchIdolPublic,
  fetchIdolTokenOwner,
  writeIdolFieldsOnChain,
  writeIdolPublicOnChain,
} from "@/lib/idol-manager-onchain";
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
    if (!tokenId) {
      setMissing(true);
      return;
    }
    void getManagerIdol({ data: { tokenId } }).then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        setMissing(true);
        return;
      }
      setIdol(loaded);
      void prefetchFullMedia(loaded.covers);
      void fetchIdolPublic(loaded.tokenId).then((value) => {
        if (!cancelled) setIsPublic(value);
      });
      void fetchIdolTokenOwner(loaded.tokenId)
        .then((value) => {
          if (!cancelled) setOwner(value);
        })
        .finally(() => {
          if (!cancelled) setOwnerReady(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [tokenId]);

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
    if (!voice) throw new Error("请先在高级设置中生成并保存声音");
    const sub = parseUsdcInput(String(next.subscribePriceUsdc)) ?? idolSubscribePriceUsdc(idol);
    const img = parseUsdcInput(String(next.imageUnlockPriceUsdc)) ?? idolImageUnlockPriceUsdc(idol);
    await writeIdolFieldsOnChain(idol.tokenId, {
      name: next.name.trim(),
      bio: next.bio.trim(),
      personality: next.personality.trim(),
      look: next.look,
      voice,
      website: next.website.trim(),
      twitter: next.twitter.trim(),
      scenes: scenesJsonOf(next),
      welcome: next.welcome.trim(),
      subscribePriceUsdc: usdcToAtomic(sub),
      imageUnlockPriceUsdc: usdcToAtomic(img),
    });
    await reloadIdol();
  }

  async function persistPublic(next: boolean): Promise<void> {
    if (!idol || !canEdit) throw new Error("Can't save");
    await writeIdolPublicOnChain(idol.tokenId, next);
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
