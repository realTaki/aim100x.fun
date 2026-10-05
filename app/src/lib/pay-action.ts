import {
  ACTION_PENDING_MIN_MS,
  ACTION_SUCCESS_HOLD_MS,
  runActionGlyph,
  type ActionGlyph,
} from "@/lib/action-glyph";

export const PAY_PENDING_MIN_MS = ACTION_PENDING_MIN_MS;
export const PAY_SUCCESS_HOLD_MS = ACTION_SUCCESS_HOLD_MS;
export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type PayActionStatus = ActionGlyph;

/** Pay buttons stay on done after the check so subscribe can become 私信. */
export async function runPayAction(
  work: () => Promise<void>,
  emit: (status: PayActionStatus) => void,
  opts?: {
    pendingMinMs?: number;
    successHoldMs?: number;
    sleep?: (ms: number) => Promise<void>;
    isCurrent?: () => boolean;
  },
): Promise<PayActionStatus> {
  return runActionGlyph(work, emit, { ...opts, afterSuccess: "done" });
}
