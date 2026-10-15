import type { Hex } from "viem";
import { mediaSql } from "../media-storage.server.ts";
import type { OperationStore, OperationResult } from "./operation-runner.ts";
import { decideStoredOperation, type ReceiptStatus } from "./stale-operation.ts";

let schemaReady: Promise<void> | undefined;

/** Preserve legacy timestamps for diagnostics; age never authorizes recovery. */
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
  settled: (hash: Hex) => Promise<ReceiptStatus>,
  ports: {
    sql?: ReturnType<typeof mediaSql>;
    ensureSchema?: () => Promise<void>;
  } = {},
): OperationStore {
  const sql = ports.sql ?? mediaSql();
  const ensureSchema = ports.ensureSchema ?? ensureProductSchema;
  async function applyDecision(
    row: Record<string, unknown>,
    id: string,
    requestedBodyHash: string,
  ): Promise<OperationResult & { bodyHash: string }> {
    const hashes = row.hashes as Hex[];
    const receipts: ReceiptStatus[] | undefined =
      row.status === "pending" && hashes.length > 0
        ? await Promise.all(
            hashes.map(async (hash): Promise<ReceiptStatus> => {
              try {
                return await settled(hash);
              } catch {
                return "unavailable";
              }
            }),
          )
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
    if (decision === "confirm" || decision === "fail") {
      const status = decision === "confirm" ? "confirmed" : "failed";
      await sql`UPDATE aim_wallet_requests SET status=${status} WHERE account_id=${accountId} AND request_id=${id} AND status='pending'`;
      await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${id}`;
      return { bodyHash: row.body_hash as string, status, hashes };
    }
    return {
      bodyHash: row.body_hash as string,
      status: row.status as OperationResult["status"],
      hashes,
      ...(row.status === "pending"
        ? {
            reason: "verification-required" as const,
            receipts,
          }
        : {}),
    };
  }
  return {
    async lookup() {
      await ensureSchema();
      const [row] =
        await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${requestId}`;
      if (!row) return null;
      return applyDecision(row, requestId, bodyHash);
    },
    async lock() {
      await ensureSchema();
      const take = async () =>
        (
          await sql`INSERT INTO aim_wallet_locks (account_id,request_id) VALUES (${accountId},${requestId}) ON CONFLICT DO NOTHING RETURNING account_id`
        ).length === 1;
      if (await take()) return true;
      const [held] =
        await sql`SELECT request_id, created_at FROM aim_wallet_locks WHERE account_id=${accountId}`;
      if (!held) return false;
      const [row] =
        await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${held.request_id as string}`;
      if (row) {
        const result = await applyDecision(row, held.request_id as string, row.body_hash as string);
        if (result.status === "pending") return false;
        // A terminal row is safe to unlock, but never delete its evidence.
        await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${held.request_id as string}`;
      } else {
        // A writer can hold a lock before begin(). Age cannot prove it stopped.
        return false;
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
