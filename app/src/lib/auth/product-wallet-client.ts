import type { Hex } from "viem";
import { getLiveWalletSessionRow, walletRequest } from "./client";
import type { ProductAction } from "./product-action";
/** Persist the request ID before sending. A lost response must not create another payment. */
export async function executeProductAction(action: ProductAction): Promise<Hex> {
  const session = getLiveWalletSessionRow();
  if (!session?.accountId) throw new Error("Sign in again");
  const key = `aim:operation:${session.accountId}:${JSON.stringify(action)}`;
  let requestId = localStorage.getItem(key);
  if (!requestId) {
    if (!window.confirm(productConfirmation(action))) throw new Error("Operation cancelled");
    requestId = crypto.randomUUID();
    localStorage.setItem(key, requestId);
  }
  const result = await walletRequest<{ status: string; hashes: Hex[] }>("wallet/send", { requestId, action });
  if (result.status === "confirmed" && result.hashes.length) {
    localStorage.removeItem(key);
    return result.hashes[result.hashes.length - 1];
  }
  if (result.status === "failed") localStorage.removeItem(key);
  throw new Error(result.status === "pending"
    ? `Operation pending review (${requestId}). Do not pay again. ${result.hashes.join(" ")}`
    : "Operation failed before submission. Check APP wallet MON and LUSD balances.");
}
export function productConfirmation(a: ProductAction) {
  const money = (s: string) => `${Number(s) / 1e6} LUSD`;
  let details: string;
  switch (a.kind) {
    case "subscribe": case "buy": details = `${a.kind} idol #${a.tokenId}, up to ${money(a.maxAmount)}`; break;
    case "mint": details = `mint an idol, up to ${money(a.maxAmount)}`; break;
    case "tip": case "sale": details = `${a.kind} for idol #${a.tokenId}: ${money(a.amount)}`; break;
    case "pricing": details = `idol #${a.tokenId}: subscription ${money(a.subscribe)}, image ${money(a.image)}`; break;
    case "agent": details = `authorize ${a.agent} as ${a.role === 2 ? "Full" : "Content"} Agent for all your idols`; break;
    case "withdraw": details = `withdraw idol #${a.tokenId} TBA LUSD to your APP wallet`; break;
    case "image": details = "unlock this image at the confirmed quote"; break;
    default: details = a.kind;
  }
  return `Confirm ${details} on Monad Testnet? Your server-controlled APP wallet signs and pays MON gas.`;
}
