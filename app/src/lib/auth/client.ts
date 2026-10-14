import { rememberExternalProvider } from "./external-wallet-provider";
import { createWalletClient, custom, getAddress, stringToHex, type EIP1193Provider } from "viem";

export const authEnabled = import.meta.env.VITE_AUTH_ENABLED !== "false";
export type WalletSessionRow = {
  id: string;
  accountId: string;
  provider: "wallet" | "privy" | "mera";
  displayName: string | null;
  primaryEmail: string | null;
  embedded?: boolean;
  loginAddress?: string;
  walletAddress?: string;
};
const SESSION_EVENT = "aim:wallet-session";
let liveRow: WalletSessionRow | null | undefined;
let resumeOnce: Promise<WalletSessionRow | null> | null = null;
// Login credentials are HttpOnly cookies. Legacy callers need no bearer header.
export function getBearerToken(): null {
  return null;
}
export function notifyWalletSessionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EVENT));
}
export function subscribeWalletSession(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SESSION_EVENT, callback);
  return () => window.removeEventListener(SESSION_EVENT, callback);
}
export function getLiveWalletSessionRow() {
  return liveRow;
}
export async function walletRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Wallet request failed");
  return data as T;
}
export async function fetchWalletSession(): Promise<WalletSessionRow | null> {
  const body = await walletRequest<{
    user: { id: string; name: string | null; loginAddress: string; walletAddress: string; identity: { provider: "wallet" | "privy" | "mera" } } | null;
  }>("get-session");
  return body.user
    ? {
        id: body.user.walletAddress.toLowerCase(),
        accountId: body.user.id,
        provider: body.user.identity.provider,
        displayName: body.user.name,
        primaryEmail: null,
        embedded: true,
        loginAddress: body.user.loginAddress,
        walletAddress: body.user.walletAddress,
      }
    : null;
}
export function resumeConnectedWalletSession() {
  return (resumeOnce ??= fetchWalletSession()
    .catch(() => null)
    .then((row) => {
      liveRow = row;
      notifyWalletSessionChanged();
      return row;
    }));
}
export async function signInWithWallet(provider: EIP1193Provider, callbackURL = "/") {
  rememberExternalProvider(provider);
  const client = createWalletClient({ transport: custom(provider) });
  const [rawAddress] = await client.requestAddresses();
  if (!rawAddress) throw new Error("No wallet selected");
  const address = getAddress(rawAddress);
  const { message } = await walletRequest<{ message: string }>("wallet/challenge", { address });
  // EIP-191 login signature. Does not authorize spending from the external wallet.
  const signature = (await provider.request({
    method: "personal_sign",
    params: [stringToHex(message), address],
  })) as string;
  await walletRequest("wallet/verify", { message, signature });
  await finishLogin(callbackURL);
}

export async function finishLogin(callbackURL = "/") {
  liveRow = await fetchWalletSession();
  if (!liveRow) throw new Error("Wallet session was not created");
  resumeOnce = Promise.resolve(liveRow);
  const { resetPrivacyPinFailures } = await import("../privacy-pin");
  resetPrivacyPinFailures(liveRow.id);
  notifyWalletSessionChanged();
  const dest = new URL(callbackURL, window.location.origin);
  if (dest.origin !== window.location.origin) throw new Error("Invalid redirect");
  window.location.assign(
    `/welcome?pin=1&next=${encodeURIComponent(dest.pathname + dest.search + dest.hash)}`,
  );
}
export async function refreshWalletSession() {
  liveRow = await fetchWalletSession();
  resumeOnce = Promise.resolve(liveRow);
  notifyWalletSessionChanged();
  return liveRow;
}
export async function signOut(redirectTo = "/") {
  await walletRequest("sign-out", {});
  liveRow = null;
  resumeOnce = Promise.resolve(null);
  // Notify other tabs without persisting account information or credentials.
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("aim-wallet-auth");
    channel.postMessage("logout");
    channel.close();
  }
  notifyWalletSessionChanged();
  window.location.assign(redirectTo);
}
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  const channel = new BroadcastChannel("aim-wallet-auth");
  channel.onmessage = () => {
    liveRow = null;
    resumeOnce = Promise.resolve(null);
    notifyWalletSessionChanged();
  };
}
export const authClient = {
  useSession: () => {
    throw new Error("Use useCurrentUserState()");
  },
};
