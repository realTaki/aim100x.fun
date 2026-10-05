import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import { renderSVG } from "uqr";
import { shortWalletAddress } from "@/lib/auth/account-host";
import {
  DEPOSIT_NETWORK_ASSET_LABEL,
  DEPOSIT_OTHER_ASSET_WARNING,
} from "@/lib/lonely-usd";

const CARD =
  "w-full max-w-xs rounded-3xl border border-border bg-surface/80 p-4 shadow-[0_20px_60px_rgb(0_0_0_/_0.35)] backdrop-blur-md";

const COPY_DONE_MS = 1400;

export function LonelyUsdDepositSheet({
  account,
  open,
  onOpenChange,
}: {
  account: `0x${string}`;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [host, setHost] = useState<Element | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrSrc = useMemo(() => {
    const svg = renderSVG(account);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [account]);

  useEffect(() => {
    if (!open) {
      setHost(null);
      setCopied(false);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
        copiedTimer.current = null;
      }
      return;
    }
    setHost(document.querySelector(".lf-frame") ?? document.body);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(account);
    } catch {
      return;
    }
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPY_DONE_MS);
  }

  if (!open || !host) return null;

  const overlay = (
    <div
      className={
        host === document.body
          ? "fixed inset-0 z-50 flex items-center justify-center px-6"
          : "absolute inset-0 z-50 flex items-center justify-center px-6"
      }
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="充值"
        className={`relative z-10 ${CARD}`}
      >
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-col items-center px-2 pb-2 text-center">
          <img src={qrSrc} alt={account} className="size-44 rounded-2xl bg-white" />
          <p className="mt-4 text-base font-semibold tracking-wide text-fg">
            {DEPOSIT_NETWORK_ASSET_LABEL}
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <p className="font-mono text-sm tracking-wide text-fg" title={account}>
              {shortWalletAddress(account)}
            </p>
            <button
              type="button"
              onClick={() => void copyAddress()}
              aria-label="Copy address"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface-2"
            >
              {copied ? (
                <Check aria-hidden className="size-4" strokeWidth={2.25} />
              ) : (
                <Copy aria-hidden className="size-4" strokeWidth={1.75} />
              )}
            </button>
          </div>
          <p className="mt-3 max-w-[16rem] text-sm text-muted">{DEPOSIT_OTHER_ASSET_WARNING}</p>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, host);
}
