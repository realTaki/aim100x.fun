import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { imageIdFromUrl } from "@/lib/library-rows";
import { isNsfwMediaLocked, resolveImageContentRating } from "@/lib/idol-media-rating";
import type { Idol } from "@/lib/idols";
import {
  formatUsdcPrice,
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
  usdcToAtomicString,
} from "@/lib/idol-pricing";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import {
  listLocalUnlockedImageIds,
  markLocalImageUnlocked,
} from "@/lib/subscribe/image-unlock-local";
import { authorizedMediaUrl } from "@/lib/chat-image-checkout";
import { unlockIdolImage } from "@/lib/subscribe/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useIdolSubscribe } from "@/lib/use-idol-fan";

export function useIdolMediaGate(
  idol: Idol,
  loginNext: string,
  opts?: { chatPerImagePaywall?: boolean },
) {
  const chatPerImagePaywall = opts?.chatPerImagePaywall ?? false;
  const { user } = useCurrentUserState();
  const subscribePriceUsdc = idolSubscribePriceUsdc(idol);
  const imageUnlockPriceUsdc = idolImageUnlockPriceUsdc(idol);
  const subscribeAtomic = usdcToAtomicString(subscribePriceUsdc);
  const unlockAtomic = usdcToAtomicString(imageUnlockPriceUsdc);

  const { isFan, subscribe } = useIdolSubscribe(idol.tokenId, loginNext, subscribeAtomic);
  const [wallet, setWallet] = useState<string | null>(null);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    void resolveConnectedWallet(user).then((w) => {
      setWallet(w);
      if (!w) {
        setUnlockedIds(new Set());
        return;
      }
      setUnlockedIds(new Set(listLocalUnlockedImageIds(w, idol.tokenId)));
    });
  }, [user, idol.tokenId, isFan]);

  const isLocked = useCallback(
    (url: string, explicit?: ImageContentRating, messageUnlocked?: boolean) => {
      const rating = resolveImageContentRating(idol, url, explicit);
      const imageId = imageIdFromUrl(url);
      if (rating === "NSFW" && authorizedMediaUrl(url) === url && !messageUnlocked) return true;
      return isNsfwMediaLocked(rating, isFan, imageId, unlockedIds, {
        chatPerImagePaywall,
        messageUnlocked,
      });
    },
    [chatPerImagePaywall, idol, isFan, unlockedIds],
  );

  const unlockImage = useCallback(
    async (url: string) => {
      const imageId = imageIdFromUrl(url);
      if (!imageId) throw new Error("Pay failed");
      const w = wallet ?? (await resolveConnectedWallet(user));
      if (!w) throw new Error("Need wallet");
      if (
        listLocalUnlockedImageIds(w, idol.tokenId).includes(imageId) &&
        authorizedMediaUrl(url) !== url
      ) {
        setUnlockedIds((prev) => new Set([...prev, imageId]));
        return;
      }
      await unlockIdolImage(idol.tokenId, imageId, unlockAtomic);
      markLocalImageUnlocked(w, idol.tokenId, imageId);
      setUnlockedIds((prev) => new Set([...prev, imageId]));
    },
    [idol.tokenId, unlockAtomic, user, wallet],
  );

  return useMemo(
    () => ({
      isFan,
      isLocked,
      subscribe,
      unlockImage,
      subscribePriceLabel: formatUsdcPrice(subscribePriceUsdc),
      imageUnlockPriceLabel: formatUsdcPrice(imageUnlockPriceUsdc),
      subscribeAtomic,
      unlockAtomic,
      unlockedIds,
    }),
    [
      imageUnlockPriceUsdc,
      isFan,
      isLocked,
      subscribe,
      subscribeAtomic,
      subscribePriceUsdc,
      unlockAtomic,
      unlockImage,
      unlockedIds,
    ],
  );
}

export type IdolMediaGate = ReturnType<typeof useIdolMediaGate>;
