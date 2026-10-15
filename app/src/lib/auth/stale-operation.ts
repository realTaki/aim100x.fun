import type { Hex } from "viem";
import type { OperationResult } from "./operation-runner.ts";

/** Monad local mempools drop unincluded txs after a few leader rounds (~seconds). */
export const STALE_OPERATION_MS = 60_000;

export type ReceiptStatus = "success" | "reverted" | null;
export type StoredDecision = "return" | "confirm" | "fail" | "recover" | "mismatch";

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

/** Missing timestamps (pre-migration rows) are treated as already stale. */
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
  if (input.status === "failed" && input.hashes.length === 0) return "recover";
  if (input.status !== "pending") return "return";
  const now = input.now ?? Date.now();
  if (input.hashes.length === input.expected && input.hashes.length > 0) {
    const receipts = input.receipts ?? [];
    if (receipts.length === input.hashes.length && receipts.every(Boolean))
      return receipts.every((status) => status === "success") ? "confirm" : "fail";
    if (
      receipts.length === input.hashes.length &&
      receipts.every((status) => status == null) &&
      isStaleOperation(input.createdAt, now)
    )
      return "recover";
    return "return";
  }
  if (isStaleOperation(input.createdAt, now)) return "recover";
  return "return";
}
