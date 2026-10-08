import { useCallback, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { atomicAmountToUsdc } from "@/lib/idol-pricing";
import { isPasskeyClientSession, passkeyFaucet } from "@/lib/auth/passkey-client";
import { LonelyUsdDepositSheet } from "@/components/lonely-usd-deposit-sheet";
import {
  LONELY_USD_FAUCET_CLAIM_LABEL,
  faucetRemainingSec,
  faucetStateLanded,
  formatFaucetCountdown,
  formatLonelyUsdAmount,
  readLonelyUsdFaucetState,
  shortFaucetError,
} from "@/lib/lonely-usd";
import { useActionGlyph } from "@/lib/use-action-glyph";
import { cn } from "@/lib/utils";

const REFRESH_ATTEMPTS = 10;
const REFRESH_GAP_MS = 400;

export function LonelyUsdFaucet({ account }: { account: `0x${string}` }) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const [lastFaucetAt, setLastFaucetAt] = useState(0n);
  const [readyAt, setReadyAt] = useState(0n);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const [depositOpen, setDepositOpen] = useState(false);
  const faucetAction = useActionGlyph();

  const remaining = faucetRemainingSec(readyAt, nowSec);
  const cooling = remaining > 0;
  const showingGlyph = faucetAction.status !== "idle" && faucetAction.status !== "done";

  const applyState = useCallback(
    (state: { balance: bigint; lastFaucetAt: bigint; readyAt: bigint }) => {
      setBalance(state.balance);
      setLastFaucetAt(state.lastFaucetAt);
      setReadyAt(state.readyAt);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const state = await readLonelyUsdFaucetState(account);
    applyState(state);
    return state;
  }, [account, applyState]);

  useEffect(() => {
    void refresh().catch(() => {
      /* RPC blip */
    });
  }, [refresh]);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [remaining]);

  async function refreshAfterFaucet(prev: {
    balance: bigint | null;
    lastFaucetAt: bigint;
    readyAt: bigint;
  }) {
    let latest: { balance: bigint; lastFaucetAt: bigint; readyAt: bigint } | null = null;
    for (let i = 0; i < REFRESH_ATTEMPTS; i++) {
      try {
        latest = await refresh();
        if (faucetStateLanded(prev, latest)) return;
      } catch {
        /* retry until the receipt is readable */
      }
      await new Promise((r) => setTimeout(r, REFRESH_GAP_MS));
    }
    if (!latest) throw new Error("faucet");
  }

  async function onFaucet() {
    if (!isPasskeyClientSession()) {
      throw new Error(shortFaucetError(new Error("passkey")));
    }
    const prev = { balance, lastFaucetAt, readyAt };
    try {
      await passkeyFaucet();
      await refreshAfterFaucet(prev);
      setNowSec(Math.floor(Date.now() / 1000));
    } catch (err) {
      console.error("[faucet]", err);
      throw new Error(shortFaucetError(err));
    }
  }

  const balanceLabel = balance === null ? "—" : formatLonelyUsdAmount(atomicAmountToUsdc(balance));
  const cooldownLabel = formatFaucetCountdown(remaining);
  const claimLabel = cooling && !showingGlyph ? cooldownLabel : LONELY_USD_FAUCET_CLAIM_LABEL;

  return (
    <div className="mt-5 flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-2">
        <p className="font-medium tabular-nums tracking-wide text-fg">{balanceLabel}</p>
        <ActionGlyphButton
          status={showingGlyph ? faucetAction.status : "idle"}
          idleLabel={claimLabel}
          pendingLabel="Claiming"
          onClick={() => void faucetAction.run(onFaucet)}
          disabled={cooling && !showingGlyph}
          className={cn(
            "inline-flex h-7 min-w-[7.25rem] items-center justify-center rounded-full px-2.5",
            "whitespace-nowrap text-sm font-semibold tabular-nums",
            cooling && !showingGlyph
              ? "cursor-not-allowed bg-surface-2 text-muted"
              : "bg-accent text-fg shadow-[0_4px_12px_rgb(192_38_255_/_0.28)]",
          )}
        >
          {claimLabel}
        </ActionGlyphButton>
        <button
          type="button"
          onClick={() => setDepositOpen(true)}
          aria-label="Deposit"
          title="Deposit"
          className="flex size-8 items-center justify-center rounded-full border border-border text-fg transition-colors hover:border-accent/40"
        >
          <QrCode aria-hidden className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      <LonelyUsdDepositSheet account={account} open={depositOpen} onOpenChange={setDepositOpen} />
    </div>
  );
}
