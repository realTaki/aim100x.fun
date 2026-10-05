export const ACTION_PENDING_MIN_MS = 450;
export const ACTION_SUCCESS_HOLD_MS = 2000;
export const ACTION_ERROR_HOLD_MS = 2000;

export type ActionGlyph = "idle" | "pending" | "success" | "error" | "done";
export type ActionGlyphBadge = "pending" | "success" | "error";

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function actionErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === "string" && err.trim()) return err.trim();
  return "操作失败，请再试一次";
}

export function isActionGlyphBusy(status: ActionGlyph): boolean {
  return status === "pending" || status === "success";
}

export function actionGlyphBadge(status: ActionGlyph): ActionGlyphBadge | undefined {
  if (status === "pending" || status === "success" || status === "error") return status;
  return undefined;
}

/** Spinner → check (then idle/done) or X (then idle). */
export async function runActionGlyph(
  work: () => Promise<void>,
  emit: (status: ActionGlyph) => void,
  opts?: {
    pendingMinMs?: number;
    successHoldMs?: number;
    errorHoldMs?: number;
    afterSuccess?: "idle" | "done";
    sleep?: (ms: number) => Promise<void>;
    isCurrent?: () => boolean;
    onError?: (message: string) => void;
  },
): Promise<ActionGlyph> {
  const sleep = opts?.sleep ?? delay;
  const pendingMin = opts?.pendingMinMs ?? ACTION_PENDING_MIN_MS;
  const successHold = opts?.successHoldMs ?? ACTION_SUCCESS_HOLD_MS;
  const errorHold = opts?.errorHoldMs ?? ACTION_ERROR_HOLD_MS;
  const afterSuccess = opts?.afterSuccess ?? "idle";
  const live = opts?.isCurrent ?? (() => true);
  emit("pending");
  const started = Date.now();
  try {
    await work();
    const wait = pendingMin - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (!live()) return "pending";
    emit("success");
    await sleep(successHold);
    if (!live()) return "success";
    emit(afterSuccess);
    return afterSuccess;
  } catch (err) {
    const wait = pendingMin - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    if (!live()) return "pending";
    const message = actionErrorMessage(err);
    opts?.onError?.(message);
    emit("error");
    await sleep(errorHold);
    if (live()) emit("idle");
    return "error";
  }
}
