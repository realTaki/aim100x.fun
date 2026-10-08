import { getLiveWalletSessionRow } from "./auth/client";
import { executeExternalCalls } from "./auth/external-wallet";
import { prepareChatImage, unlockChatImage } from "./data";
import { normalizeMediaId } from "./media-app-id";
const pending = new Map<string, Promise<Awaited<ReturnType<typeof unlockChatImage>>>>();
const submitted = new Map<string, { paymentIntent: string; transactionHash?: `0x${string}` }>();
export function checkoutChatImage(imageId: string, paymentIntent: string) {
  const wallet = getLiveWalletSessionRow()?.loginAddress;
  if (!wallet) return Promise.reject(new Error("Sign in with your external wallet"));
  const key = `${wallet.toLowerCase()}:${normalizeMediaId(imageId)}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = runCheckout(imageId, paymentIntent).finally(() => pending.delete(key));
  pending.set(key, work);
  return work;
}
async function runCheckout(imageId: string, paymentIntent: string) {
  const wallet = getLiveWalletSessionRow()?.loginAddress;
  if (!wallet) throw new Error("Sign in with your external wallet");
  const key = `aim:image-checkout:v1:${wallet.toLowerCase()}:${normalizeMediaId(imageId)}`;
  const raw = localStorage.getItem(key);
  let checkout: { paymentIntent: string; transactionHash?: `0x${string}` } =
    submitted.get(key) ?? (raw ? JSON.parse(raw) : { paymentIntent });
  localStorage.setItem(key, JSON.stringify(checkout));
  if (!checkout.transactionHash) {
    const prepared = await prepareChatImage({
      data: { imageId, paymentIntent: checkout.paymentIntent },
    });
    // Store the hash as soon as the wallet submits it. A timeout must only trigger
    // receipt checking on retry, never another payment.
    await executeExternalCalls(wallet as `0x${string}`, prepared.calls, {
      onSubmitted: (hash, index) => {
        if (index !== prepared.calls.length - 1) return;
        checkout = { ...checkout, transactionHash: hash };
        submitted.set(key, checkout);
        localStorage.setItem(key, JSON.stringify(checkout));
      },
    });
  }
  if (!checkout.transactionHash) throw new Error("Payment was not submitted");
  const result = await unlockChatImage({
    data: {
      imageId,
      paymentIntent: checkout.paymentIntent,
      transactionHash: checkout.transactionHash,
    },
  });
  rememberImageAccess(wallet, imageId, result.imageUrl);
  return result;
}
const accessKey = (wallet: string, imageId: string) =>
  `aim:image-access:v1:${wallet.toLowerCase()}:${normalizeMediaId(imageId)}`;
export function rememberImageAccess(wallet: string, imageId: string, url: string) {
  localStorage.setItem(accessKey(wallet, imageId), url);
}
export function authorizedMediaUrl(src: string): string {
  if (typeof window === "undefined" || !src.startsWith("/api/media/")) return src;
  const wallet = getLiveWalletSessionRow()?.loginAddress;
  if (!wallet) return src;
  const url = new URL(src, window.location.origin);
  if (url.searchParams.has("access")) return src;
  const id = decodeURIComponent(url.pathname.slice("/api/media/".length));
  const saved = localStorage.getItem(accessKey(wallet, id));
  if (!saved) return src;
  const access = new URL(saved, window.location.origin).searchParams.get("access");
  if (access) url.searchParams.set("access", access);
  return url.pathname + url.search;
}
