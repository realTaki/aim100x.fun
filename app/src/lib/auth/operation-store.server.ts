import type { Hex } from "viem";
import { mediaSql } from "../media-storage.server.ts";
import type { OperationStore, OperationResult } from "./operation-runner.ts";
import {
  decideStoredOperation,
  isStaleOperation,
  type ReceiptStatus,
} from "./stale-operation.ts";

let schemaReady: Promise<void> | undefined;

/** Existing Production rows get epoch created_at so a stuck pending recovers on first lookup. */
export async function initializeProductSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_wallet_requests (account_id text NOT NULL, request_id uuid NOT NULL, body_hash text NOT NULL, status text NOT NULL, hashes jsonb NOT NULL DEFAULT '[]', expected integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,request_id))`;
  await sql`CREATE TABLE IF NOT EXISTS aim_wallet_locks (account_id text PRIMARY KEY, request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE aim_wallet_requests ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT TIMESTAMPTZ '1970-01-01 00:00:00+00'`;
  await sql`ALTER TABLE aim_wallet_requests ALTER COLUMN created_at SET DEFAULT now()`;
  await sql`ALTER TABLE aim_wallet_locks ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT TIMESTAMPTZ '1970-01-01 00:00:00+00'`;
  await sql`ALTER TABLE aim_wallet_locks ALTER COLUMN created_at SET DEFAULT now()`;
}

function ensureProductSchema() {
  return (schemaReady ??= initializeProductSchema());
}

/** Shared durable nonce lock for APP wallet calls and the testnet gas sponsor. */
export function operationStore(
  accountId: string,
  requestId: string,
  bodyHash: string,
  settled: (hash: Hex) => Promise<"success" | "reverted" | null>,
): OperationStore {
  const sql = mediaSql();
  async function applyDecision(
    row: Record<string, unknown>,
    id: string,
    requestedBodyHash: string,
  ): Promise<"recovered" | (OperationResult & { bodyHash: string })> {
    const hashes = row.hashes as Hex[];
    const receipts: ReceiptStatus[] | undefined =
      row.status === "pending" && hashes.length === Number(row.expected) && hashes.length > 0
        ? await Promise.all(hashes.map(settled))
        : undefined;
    const decision = decideStoredOperation({
      status: row.status as OperationResult["status"],
      bodyHash: row.body_hash as string,
      requestedBodyHash,
      hashes,
      expected: Number(row.expected),
      createdAt: row.created_at,
      receipts,
    });
    if (decision === "recover") {
      await sql`DELETE FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${id}`;
      await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${id}`;
      return "recovered";
    }
    if (decision === "confirm" || decision === "fail") {
      const status = decision === "confirm" ? "confirmed" : "failed";
      await sql`UPDATE aim_wallet_requests SET status=${status} WHERE account_id=${accountId} AND request_id=${id}`;
      await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${id}`;
      return { bodyHash: row.body_hash as string, status, hashes };
    }
    return {
      bodyHash: row.body_hash as string,
      status: row.status as OperationResult["status"],
      hashes,
    };
  }
  return {
    async lookup() {
      await ensureProductSchema();
      const [row] =
        await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${requestId}`;
      if (!row) return null;
      const result = await applyDecision(row, requestId, bodyHash);
      return result === "recovered" ? null : result;
    },
    async lock() {
      await ensureProductSchema();
      const take = async () =>
        (
          await sql`INSERT INTO aim_wallet_locks (account_id,request_id) VALUES (${accountId},${requestId}) ON CONFLICT DO NOTHING RETURNING account_id`
        ).length === 1;
      if (await take()) return true;
      const [held] =
        await sql`SELECT request_id, created_at FROM aim_wallet_locks WHERE account_id=${accountId}`;
      if (!held || !isStaleOperation(held.created_at)) return false;
      const [row] =
        await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${held.request_id as string}`;
      if (row) {
        const result = await applyDecision(row, held.request_id as string, row.body_hash as string);
        if (result !== "recovered" && result.status === "pending") return false;
      } else {
        await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${held.request_id as string}`;
      }
      return take();
    },
    async begin(count) {
      await sql`INSERT INTO aim_wallet_requests (account_id,request_id,body_hash,status,expected) VALUES (${accountId},${requestId},${bodyHash},'pending',${count})`;
    },
    async hashes(hashes) {
      await sql`UPDATE aim_wallet_requests SET hashes=${JSON.stringify(hashes)}::jsonb WHERE account_id=${accountId} AND request_id=${requestId}`;
    },
    async status(status) {
      await sql`UPDATE aim_wallet_requests SET status=${status} WHERE account_id=${accountId} AND request_id=${requestId}`;
    },
    async release() {
      await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${requestId}`;
    },
  };
}
