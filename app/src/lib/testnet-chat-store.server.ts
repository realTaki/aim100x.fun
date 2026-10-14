import { mediaSql } from "./media-storage.server.ts";
import type { TextRecord, TextStore } from "./testnet-chat-runner.ts";
import type { Hex } from "viem";
export async function initializeTextChatSchema() {
  await mediaSql()`CREATE TABLE IF NOT EXISTS aim_text_chat (
    account_id text NOT NULL, request_id uuid NOT NULL, body_hash text NOT NULL,
    status text NOT NULL DEFAULT 'unpaid', payment_hash text UNIQUE, reply text,
    attempts integer NOT NULL DEFAULT 0, locked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(account_id,request_id), UNIQUE(account_id,body_hash))`;
}
export function textChatStore(accountId: string): TextStore {
  const sql = mediaSql();
  return {
    async open(requestId, bodyHash) {
      await sql`INSERT INTO aim_text_chat (account_id,request_id,body_hash) VALUES (${accountId},${requestId},${bodyHash}) ON CONFLICT DO NOTHING`;
      const rows =
        await sql`SELECT * FROM aim_text_chat WHERE account_id=${accountId} AND (request_id=${requestId} OR body_hash=${bodyHash}) ORDER BY (request_id=${requestId}) DESC LIMIT 1`;
      const r = rows[0];
      if (!r) throw new Error("Message storage unavailable");
      return {
        requestId: r.request_id as string,
        bodyHash: r.body_hash as string,
        status: r.status as TextRecord["status"],
        paymentHash: r.payment_hash as Hex | null,
        reply: r.reply as string | null,
        attempts: r.attempts as number,
      };
    },
    async lock(id) {
      return (
        (
          await sql`UPDATE aim_text_chat SET locked=true WHERE account_id=${accountId} AND request_id=${id} AND locked=false RETURNING request_id`
        ).length === 1
      );
    },
    async save(r) {
      await sql`UPDATE aim_text_chat SET status=${r.status},payment_hash=${r.paymentHash},reply=${r.reply},attempts=${r.attempts} WHERE account_id=${accountId} AND request_id=${r.requestId} AND locked=true`;
    },
    async release(id) {
      await sql`UPDATE aim_text_chat SET locked=false WHERE account_id=${accountId} AND request_id=${id}`;
    },
  };
}
