import { passkeyPay, passkeySubscribe } from "@/lib/auth/passkey-client";
import type { AppUser } from "@/lib/auth/use-current-user";
import { persistNewSubscriberThread } from "@/lib/chat-client";
import { getCatalogIdol } from "@/lib/idol-catalog";

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
    await persistNewSubscriberThread(user, idol).catch(() => undefined);
  }
  return { ok: true, isFan: true };
}

export async function unlockIdolImage(
  tokenId: number,
  _imageId: string,
  maxAmountAtomic: string,
): Promise<{ ok: true }> {
  const amount = BigInt(maxAmountAtomic);
  await passkeyPay(tokenId, amount);
  return { ok: true };
}
