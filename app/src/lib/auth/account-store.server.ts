import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { mediaSql } from "../media-storage.server.ts";
import { accountIdFor, identityKey, normalizeIdentity, type LoginIdentity } from "./identity.ts";
export type StoredAccount = { id: string; identity: LoginIdentity; walletAddress: Address };
export type AuthStore = {
  account(identity: LoginIdentity, address: Address): Promise<StoredAccount>;
  challenge(id: string, value: string, expires: number): Promise<void>;
  consume(id: string, value: string): Promise<boolean>;
  session(id: string, accountId: string, expires: number): Promise<void>;
  active(id: string, accountId: string): Promise<boolean>;
  revoke(id: string): Promise<void>;
};
export async function initializeAuthSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_auth_accounts (id text PRIMARY KEY, identity_key text UNIQUE NOT NULL, wallet_address text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS aim_auth_challenges (id text PRIMARY KEY, value text NOT NULL, expires_at timestamptz NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS aim_auth_sessions (id uuid PRIMARY KEY, account_id text NOT NULL REFERENCES aim_auth_accounts(id), expires_at timestamptz NOT NULL)`;
}
export const authStore: AuthStore = {
  async account(input, address) {
    const identity = normalizeIdentity(input), id = accountIdFor(identity), key = identityKey(identity);
    const sql = mediaSql();
    const [row] = await sql`INSERT INTO aim_auth_accounts (id,identity_key,wallet_address) VALUES (${id},${key},${address.toLowerCase()}) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id RETURNING identity_key,wallet_address`;
    if (row.identity_key !== key || row.wallet_address !== address.toLowerCase())
      throw new Error("Wallet derivation changed; restore the original master secret");
    return { id, identity, walletAddress: address };
  },
  async challenge(id, value, expires) {
    await mediaSql()`INSERT INTO aim_auth_challenges (id,value,expires_at) VALUES (${id},${value},${new Date(expires).toISOString()})`;
  },
  async consume(id, value) {
    const rows = await mediaSql()`DELETE FROM aim_auth_challenges WHERE id=${id} AND value=${value} AND expires_at>now() RETURNING id`;
    return rows.length === 1;
  },
  async session(id, accountId, expires) {
    await mediaSql()`INSERT INTO aim_auth_sessions (id,account_id,expires_at) VALUES (${id},${accountId},${new Date(expires).toISOString()})`;
  },
  async active(id, accountId) {
    if (!/^[a-f0-9-]{36}$/.test(id)) return false;
    const rows = await mediaSql()`SELECT id FROM aim_auth_sessions WHERE id=${id} AND account_id=${accountId} AND expires_at>now()`;
    return rows.length === 1;
  },
  async revoke(id) { await mediaSql()`DELETE FROM aim_auth_sessions WHERE id=${id}`; },
};
export { randomUUID };
