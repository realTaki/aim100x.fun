import { wrapFetchWithSIWx } from "@x402/extensions/sign-in-with-x";
import { x402Client } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment, decodePaymentResponseHeader } from "@x402/fetch";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { MONAD_USDC, mainnetWalletChain } from "./auth/app-wallet-chain.ts";

export const MAX_API_PAYMENT = 100_000n; // 0.10 USDC per call, disclosed at login.
export const MONID_RUN_URL = "https://x402.monid.ai/v1/run";
export const ELEVENLABS_STT_URL = "https://x402.orthogonal.com/elevenlabs/v1/speech-to-text";
const sellers: Record<string, Address> = {
  [ELEVENLABS_STT_URL]: "0xDEFaDa13F790cf39168691B391Cfa0b6f1f5c267",
  [MONID_RUN_URL]: "0x9D3d9410Be95fa1d230734B961997427fc61D837",
};
export function validPaymentOffer(url: string, offer: PaymentRequirements): boolean {
  return (
    Boolean(sellers[url]) &&
    offer.network === "eip155:143" &&
    offer.scheme === "exact" &&
    offer.asset.toLowerCase() === MONAD_USDC.toLowerCase() &&
    offer.payTo.toLowerCase() === sellers[url].toLowerCase() &&
    /^\d{1,12}$/.test(offer.amount) &&
    BigInt(offer.amount) > 0n &&
    BigInt(offer.amount) <= MAX_API_PAYMENT &&
    Number.isSafeInteger(offer.maxTimeoutSeconds) &&
    offer.maxTimeoutSeconds > 0 &&
    offer.maxTimeoutSeconds <= 3600 &&
    offer.extra?.name === "USDC" &&
    offer.extra?.version === "2" &&
    (!offer.extra.assetTransferMethod || offer.extra.assetTransferMethod === "eip3009")
  );
}
export async function paidFetch(
  owner: PrivateKeyAccount,
  url: string,
  init: RequestInit,
  deps: { fetch?: typeof fetch; balance?: () => Promise<bigint> } = {},
): Promise<Response> {
  if (!sellers[url]) throw new Error("API endpoint is not allowed");
  const reader = createPublicClient({
    chain: mainnetWalletChain,
    transport: http(mainnetWalletChain.rpcUrls.default.http[0]),
  });
  const readBalance =
    deps.balance ??
    (() =>
      reader.readContract({
        address: MONAD_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner.address],
      }));
  let signed = false;
  let quotedAmount = "0";
  const client = new x402Client()
    .register("eip155:143", new ExactEvmScheme(owner))
    .registerPolicy((version, offers) =>
      version === 2 ? offers.filter((o) => validPaymentOffer(url, o)) : [],
    )
    .onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
      if (signed) throw new Error("Payment already attempted; do not retry automatically");
      if (paymentRequired.resource.url !== url || !validPaymentOffer(url, selectedRequirements))
        throw new Error("API payment terms changed");
      if (/ERROR:|Unable to calculate price/i.test(paymentRequired.resource.description ?? ""))
        throw new Error("API provider could not calculate a valid price");
      if ((await readBalance()) < BigInt(selectedRequirements.amount))
        throw new Error("请先向应用内钱包充值 Monad 主网 USDC");
      quotedAmount = selectedRequirements.amount;
    })
    .onAfterPaymentCreation(async () => {
      signed = true;
    });
  const fetchWithPayment = wrapFetchWithPayment(deps.fetch ?? fetch, client);
  let response: Response;
  try {
    response = await fetchWithPayment(url, { ...init, redirect: "error" });
  } catch (error) {
    if (signed)
      throw new Error(
        "API payment was submitted; confirmation is unavailable. Check wallet transactions before retrying.",
      );
    throw error;
  }
  if (signed) {
    const header = response.headers.get("PAYMENT-RESPONSE");
    if (!header)
      throw new Error("API payment response has no settlement receipt; do not retry automatically");
    const receipt = decodePaymentResponseHeader(header);
    if (
      !receipt.success ||
      receipt.network !== "eip155:143" ||
      !receipt.transaction ||
      receipt.payer?.toLowerCase() !== owner.address.toLowerCase()
    )
      throw new Error("API settlement could not be confirmed; do not retry automatically");
    console.info("api.payment", {
      chainId: 143,
      amount: quotedAmount,
      transaction: receipt.transaction,
    });
  }
  return response;
}

/** Fetch only a run returned by Monid. SIWX proves payer identity; never pay again to poll. */
export async function retrieveMonidRun(owner: PrivateKeyAccount, url: string, signal: AbortSignal) {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://x402.monid.ai" ||
    !/^\/v1\/runs\/[a-zA-Z0-9_-]+$/.test(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Invalid API run URL");
  return wrapFetchWithSIWx(fetch, owner)(url, { method: "GET", redirect: "error", signal });
}
