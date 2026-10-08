import { externalSigningClient } from "@/lib/auth/external-wallet";
import { useEffect, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits } from "viem";
import { walletRequest } from "@/lib/auth/client";
import { mainnetWalletChain, MONAD_USDC } from "@/lib/auth/app-wallet-chain";

type Balance = { address: `0x${string}`; loginAddress: `0x${string}`; balance: string };
export function ApiWalletBalance({ account }: { account: `0x${string}` }) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transaction, setTransaction] = useState<`0x${string}` | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      walletRequest<Balance>("wallet/balance")
        .then((value) => {
          if (active && value.address.toLowerCase() === account.toLowerCase()) setBalance(value);
        })
        .catch(() => {
          if (active) setError("USDC balance is temporarily unavailable");
        });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [account]);
  async function deposit() {
    setBusy(true);
    setError("");
    setTransaction(null);
    try {
      if (!/^\d{1,6}(?:\.\d{1,6})?$/.test(amount) || parseUnits(amount, 6) <= 0n)
        throw new Error("Enter a valid USDC amount");
      if (!balance)
        throw new Error(
          "Deposit Monad mainnet USDC from your external wallet to the address below",
        );
      const wallet = await externalSigningClient(balance.loginAddress, mainnetWalletChain);
      const sender = balance.loginAddress;
      const hash = await wallet.writeContract({
        chain: mainnetWalletChain,
        account: sender,
        address: MONAD_USDC,
        abi: erc20Abi,
        functionName: "transfer",
        args: [account, parseUnits(amount, 6)],
      });
      setTransaction(hash);
      const reader = createPublicClient({
        chain: mainnetWalletChain,
        transport: http(mainnetWalletChain.rpcUrls.default.http[0]),
      });
      const receipt = await reader.waitForTransactionReceipt({ hash, timeout: 30_000 });
      if (receipt.status !== "success") throw new Error("Deposit transaction failed");
      setBalance(await walletRequest<Balance>("wallet/balance"));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Deposit failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-5 w-full max-w-sm rounded-2xl border border-border bg-surface p-4">
      <p className="text-sm font-medium">API wallet · Monad mainnet</p>
      <p className="mt-2 text-lg tabular-nums">
        {balance ? formatUnits(BigInt(balance.balance), 6) : "—"} USDC
      </p>
      <button
        type="button"
        className="mt-2 w-full break-all text-left text-xs text-muted"
        aria-label="Copy deposit address"
        onClick={() =>
          void navigator.clipboard
            .writeText(account)
            .then(() => setCopied(true))
            .catch(() => setError("Could not copy. Copy the address manually."))
        }
      >
        {account}
        {copied ? " · Copied" : " · Copy"}
      </button>
      <p className="mt-2 text-xs text-muted">
        Deposit Monad mainnet USDC. API payments are automatic, up to 0.10 USDC per request. LUSD
        below is for testnet interactions.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          aria-label="USDC deposit amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2"
        />
        <button
          type="button"
          disabled={busy || !balance}
          onClick={() => void deposit()}
          className="rounded-xl bg-accent px-4 py-2 disabled:opacity-50"
        >
          {busy ? "Depositing…" : "Deposit"}
        </button>
      </div>
      {transaction && (
        <a
          className="mt-2 block text-xs text-accent"
          target="_blank"
          rel="noreferrer"
          href={`https://monadvision.com/tx/${transaction}`}
        >
          View deposit transaction
        </a>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
