import { useEffect, useRef } from "react";
import type { ChatMsg } from "@/lib/thread";
import { checkoutChatImage } from "@/lib/chat-image-checkout";
import { usePayAction } from "@/lib/use-pay-action";
import { atomicAmountToUsdc, formatUsdcPrice } from "@/lib/idol-pricing";
import { getLiveWalletSessionRow } from "@/lib/auth/client";

export function ChatImagePaywall({
  message,
  onUnlocked,
}: {
  message: ChatMsg;
  onUnlocked?: (id: string, imageUrl: string) => void;
}) {
  const pay = usePayAction();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const price = formatUsdcPrice(atomicAmountToUsdc(message.imagePaymentAmount ?? "0"));
  return (
    <button
      type="button"
      disabled={
        !onUnlocked ||
        pay.status === "pending" ||
        pay.status === "success" ||
        pay.status === "error"
      }
      aria-label={`Unlock photo for ${price}`}
      className="flex h-44 w-48 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm text-muted disabled:opacity-70"
      onClick={() =>
        void pay.run(async () => {
          if (!message.imageId || !message.imagePaymentIntent) throw new Error("Photo unavailable");
          const subject = getLiveWalletSessionRow()?.id;
          const result = await checkoutChatImage(message.imageId, message.imagePaymentIntent);
          if (mounted.current && subject === getLiveWalletSessionRow()?.id)
            onUnlocked?.(message.id, result.imageUrl);
        })
      }
    >
      <span className="text-2xl" aria-hidden>
        🔒
      </span>
      <span role="status">
        {pay.status === "pending"
          ? "Unlocking…"
          : pay.status === "error"
            ? "Payment failed"
            : "Unlock photo"}
      </span>
      <span>{price}</span>
    </button>
  );
}
