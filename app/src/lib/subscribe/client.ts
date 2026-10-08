import { passkeySubscribe } from "@/lib/auth/passkey-client";
import type { AppUser } from "@/lib/auth/use-current-user";
import { persistNewSubscriberThread } from "@/lib/chat-client";
import { getCatalogIdol, getChatIdol } from "@/lib/idol-catalog";

export async function subscribeToIdol(
  tokenId: number,
  maxAmountAtomic: string,
  user?: AppUser | null,
): Promise<{ ok: true; isFan: boolean }> {
  const idol = await getCatalogIdol({ data: { tokenId } });
  if (!idol) throw new Error("Pay failed");
  const amount = BigInt(maxAmountAtomic);
  await passkeySubscribe(idol.tokenId, amount);
  if (user) {
    const chat = await getChatIdol({ data: { tokenId } });
    if (chat) await persistNewSubscriberThread(user, chat).catch(() => undefined);
  }
  return { ok: true, isFan: true };
}

export async function unlockIdolImage(tokenId: number, imageId: string, maxAmountAtomic: string) {
  const { quoteImageUnlock } = await import("../data");
  const { checkoutChatImage } = await import("../chat-image-checkout");
  const quote = await quoteImageUnlock({ data: { tokenId, imageId, maxAmountAtomic } });
  return checkoutChatImage(imageId, quote.paymentIntent);
}
