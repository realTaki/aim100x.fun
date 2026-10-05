import { CircleDollarSign, Users } from "lucide-react";
import { formatReceiptsAmount } from "@/lib/idol-pricing";
import { cn } from "@/lib/utils";

export function IdolOnChainStats({
  subscriberCount,
  receiptsUsdc,
  className,
}: {
  subscriberCount: number;
  receiptsUsdc: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted", className)}>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <Users className="size-3.5" strokeWidth={1.75} aria-hidden />
        {subscriberCount}
      </span>
      <span className="inline-flex items-center gap-1 tabular-nums">
        <CircleDollarSign className="size-3.5" strokeWidth={1.75} aria-hidden />
        {formatReceiptsAmount(receiptsUsdc)}
      </span>
    </div>
  );
}
