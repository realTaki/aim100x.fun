import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { walletRequest } from "@/lib/auth/client";
export function ApiWalletBalance({ account }: { account: `0x${string}` }) {
  const [balance, setBalance] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      walletRequest<{ address: string; balance: string }>("wallet/balance")
        .then((value) => {
          if (active && value.address.toLowerCase() === account.toLowerCase())
            setBalance(value.balance);
        })
        .catch(() => {
          if (active) setError("Balance unavailable. Check RPC configuration.");
        });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [account]);
  return (
    <section className="mt-5 w-full max-w-sm rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">APP wallet</p>
      <p className="mt-2 text-lg">
        {balance ? formatUnits(BigInt(balance), 6) : "—"} LUSD · Monad Testnet
      </p>
      <button
        type="button"
        aria-label="Copy APP wallet address"
        className="mt-2 w-full break-all text-left text-xs text-muted"
        onClick={() =>
          void navigator.clipboard
            .writeText(account)
            .then(() => setCopied(true))
            .catch(() => setError("Copy the address manually."))
        }
      >
        {account}
        {copied ? " · Copied" : " · Copy"}
      </button>
      <p className="mt-2 text-xs text-muted">
        Text chat costs 1 testnet LUSD per message. Claim +100 LUSD above. The platform funds gas
        for faucet, subscription and text payments; you do not need mainnet USDC or MON. The server
        controls this APP wallet.
      </p>
      <p className="mt-2 text-xs text-muted">
        Assets and subscriptions in your previous external or Passkey wallet stay there. They are
        not automatically migrated.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
