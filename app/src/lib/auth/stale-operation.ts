import type { Hex } from "viem";
import type { OperationResult } from "./operation-runner.ts";

/** Diagnostic age only: elapsed time never proves a transaction safe to replay. */
export const STALE_OPERATION_MS = 60_000;

export type ReceiptStatus = "success" | "reverted" | "unavailable" | null;
export type StoredDecision = "return" | "confirm" | "fail" | "mismatch";

export function createdAtMs(value: unknown): number {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : 0;
  }
  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}

export function isStaleOperation(createdAt: unknown, now = Date.now()): boolean {
  return now - createdAtMs(createdAt) >= STALE_OPERATION_MS;
}

/** Keep every request and hash. Unknown or partial execution requires reconciliation. */
export function decideStoredOperation(input: {
  status: OperationResult["status"];
  bodyHash: string;
  requestedBodyHash: string;
  hashes: Hex[];
  expected: number;
  createdAt: unknown;
  receipts?: ReceiptStatus[];
  now?: number;
}): StoredDecision {
  if (input.bodyHash !== input.requestedBodyHash) return "mismatch";
  if (input.status !== "pending") return "return";
  const receipts = input.receipts ?? [];
  // A live writer may still be processing the next call. Partial receipts must
  // neither release its lock nor cause already completed calls to run again.
  if (
    input.expected > 0 &&
    input.hashes.length === input.expected &&
    receipts.length === input.hashes.length &&
    receipts.every((status) => status === "success" || status === "reverted")
  )
    return receipts.every((status) => status === "success") ? "confirm" : "fail";
  return "return";
}
