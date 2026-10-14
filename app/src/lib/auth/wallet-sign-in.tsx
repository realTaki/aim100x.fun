import { PrivySignIn } from "./privy-sign-in";
import { meraOriginError } from "./mera-config.ts";
import { signInWithMera } from "./mera-client";
import { useEffect, useState } from "react";
import type { EIP1193Provider } from "viem";
import { signInWithWallet } from "./client";

type Wallet = { info: { uuid: string; name: string }; provider: EIP1193Provider };
export function WalletSignIn({ callbackURL = "/" }: { callbackURL?: string }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meraError, setMeraError] = useState<string | null>(null);
  useEffect(() => {
    setMeraError(meraOriginError(window.location.origin, import.meta.env.VITE_MERA_RP_ID));
  }, []);
  useEffect(() => {
    const announce = (event: Event) => {
      const wallet = (event as CustomEvent<Wallet>).detail;
      if (!wallet?.provider?.request || !wallet.info?.uuid) return;
      setWallets((current) =>
        current.some((w) => w.info.uuid === wallet.info.uuid) ? current : [...current, wallet],
      );
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
    if (injected)
      setWallets((current) =>
        current.length
          ? current
          : [{ info: { uuid: "injected", name: "Wallet" }, provider: injected }],
      );
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  async function login(wallet: Wallet) {
    setBusy(true);
    setError("");
    try {
      await signInWithWallet(wallet.provider, callbackURL);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not sign in");
      setBusy(false);
    }
  }
  return (
    <div className="relative mt-8 w-full max-w-xs rounded-3xl border border-border bg-surface/80 p-4">
      <p className="mb-3 text-center text-sm text-muted">Choose how to sign in</p>
      <p className="mb-3 text-xs text-muted">
        Each login method has a separate APP account. The server controls your APP wallet and signs
        its transactions.
      </p>
      {import.meta.env.VITE_PRIVY_APP_ID && <PrivySignIn callbackURL={callbackURL} />}
      {
        <div className="mb-3 flex gap-2">
          {[false, true].map((create) => (
            <button
              key={String(create)}
              type="button"
              disabled={busy || !!meraError}
              className="rounded-xl border p-2 text-sm"
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await signInWithMera(create, callbackURL);
                } catch {
                  setError(
                    "Mera sign-in failed. Use a PRF-compatible passkey and the original RP domain.",
                  );
                  setBusy(false);
                }
              }}
            >
              {create ? "Create Mera passkey" : "Sign in with Mera"}
            </button>
          ))}
        </div>
      }
      {meraError && (
        <p role="status" className="mb-3 text-xs text-muted">
          {meraError}
        </p>
      )}
      {wallets.map((wallet) => (
        <button
          key={wallet.info.uuid}
          type="button"
          disabled={busy}
          onClick={() => void login(wallet)}
          className="mb-2 h-12 w-full rounded-2xl bg-accent text-fg disabled:opacity-50"
        >
          {busy ? "Signing in…" : wallet.info.name}
        </button>
      ))}
      {!wallets.length && (
        <p className="text-sm text-muted">
          Open in a wallet browser or install a wallet extension.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
