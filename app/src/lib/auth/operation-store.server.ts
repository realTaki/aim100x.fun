import type { Hex } from "viem";
import { mediaSql } from "../media-storage.server.ts";
import type { OperationStore, OperationResult } from "./operation-runner.ts";

/** Shared durable nonce lock for APP wallet calls and the testnet gas sponsor. */
export function operationStore(
  accountId: string,
  requestId: string,
  bodyHash: string,
  settled: (hash: Hex) => Promise<"success" | "reverted" | null>,
): OperationStore {
  const sql = mediaSql();
  return {
    async lookup() {
      const [row] =
        await sql`SELECT * FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${requestId}`;
      if (!row) return null;
      const hashes = row.hashes as Hex[];
      // No signed APP transaction ever existed; an explicit same-ID retry is safe.
      if (row.status === "failed" && hashes.length === 0 && row.body_hash === bodyHash) {
        await sql`DELETE FROM aim_wallet_requests WHERE account_id=${accountId} AND request_id=${requestId} AND status='failed' AND hashes='[]'::jsonb`;
        return null;
      }
      if (row.status === "pending" && hashes.length === row.expected) {
        const receipts = await Promise.all(hashes.map(settled));
        if (receipts.every(Boolean)) {
          row.status = receipts.every((r) => r === "success") ? "confirmed" : "failed";
          await sql`UPDATE aim_wallet_requests SET status=${row.status as string} WHERE account_id=${accountId} AND request_id=${requestId}`;
          await sql`DELETE FROM aim_wallet_locks WHERE account_id=${accountId} AND request_id=${requestId}`;
        }
      }
      return {
        bodyHash: row.body_hash as string,
        status: row.status as OperationResult["status"],
        hashes,
      };
    },
    async lock() {
      return (
        (
          await sql`INSERT INTO aim_wallet_locks (account_id,request_id) VALUES (${accountId},${requestId}) ON CONFLICT DO NOTHING RETURNING account_id`
        ).length === 1
      );
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
