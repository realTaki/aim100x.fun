import { mediaSql } from "../media-storage.server.ts";
import { createHash } from "node:crypto";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readPaymasterSigner } from "../paymaster-signer.ts";

export const DAILY_GAS_ALLOWANCE = 1_000_000_000_000_000_000n; // 1 testnet MON / APP wallet / UTC day.
export async function initializeGasSchema() {
  const sql = mediaSql();
  await sql`CREATE TABLE IF NOT EXISTS aim_gas_allowance (wallet text NOT NULL, day date NOT NULL, amount numeric(78,0) NOT NULL, PRIMARY KEY(wallet,day))`;
  await sql`CREATE TABLE IF NOT EXISTS aim_gas_reservations (request_id uuid PRIMARY KEY, wallet text NOT NULL, amount numeric(78,0) NOT NULL)`;
}
/** Invoked under the shared sponsor lock; a crash may consume quota, never expand it. */
async function reserveGas(wallet: Address, requestId: string, amount: bigint) {
  const sql = mediaSql(),
    address = wallet.toLowerCase();
  const existing =
    await sql`SELECT request_id FROM aim_gas_reservations WHERE request_id=${requestId}`;
  if (existing.length) return;
  const granted =
    await sql`INSERT INTO aim_gas_allowance(wallet,day,amount) VALUES (${address},(now() AT TIME ZONE 'UTC')::date,${amount.toString()}::numeric)
    ON CONFLICT(wallet,day) DO UPDATE SET amount=aim_gas_allowance.amount+EXCLUDED.amount
    WHERE aim_gas_allowance.amount+EXCLUDED.amount<=${DAILY_GAS_ALLOWANCE.toString()}::numeric RETURNING amount`;
  if (!granted.length) throw new Error("Daily testnet gas allowance exhausted");
  await sql`INSERT INTO aim_gas_reservations(request_id,wallet,amount) VALUES (${requestId},${address},${amount.toString()}::numeric)`;
}
export const SPONSORED_GAS = 300_000n;
export const MAX_PRODUCT_GAS = 2_000_000n;
export const MAX_SPONSORED_FEE = 200_000_000_000n;
/** Monad `eth_maxPriorityFeePerGas` is hardcoded at 2 gwei; 0-tip txs are dropped. */
export const MONAD_PRIORITY_FEE = 2_000_000_000n;
/** Category Labs 7.5% gas-limit margin. Monad charges the limit, not gas used. */
export const MONAD_GAS_LIMIT_MARGIN_BPS = 10_750n;
export const SPONSORED_VERIFICATION_GAS = 150_000n;
export const SPONSORED_PRE_VERIFICATION_GAS = 80_000n;
export const SPONSORED_HANDLE_OPS_OVERHEAD = 100_000n;
export const MAX_SPONSORED_OUTER_GAS = 2_500_000n;
export function sponsorAccount() {
  return privateKeyToAccount(readPaymasterSigner());
}
export function productGasLimit(estimated: bigint, cap = MAX_PRODUCT_GAS) {
  const base = estimated < 21_000n ? 21_000n : estimated;
  const buffered = (base * MONAD_GAS_LIMIT_MARGIN_BPS + 9_999n) / 10_000n;
  const gas = buffered > cap ? cap : buffered;
  if (gas < 21_000n || gas > cap) throw new Error("Invalid sponsored gas limit");
  return gas;
}
export function sponsoredOuterGas(innerGas: bigint) {
  const gas =
    productGasLimit(innerGas) +
    SPONSORED_VERIFICATION_GAS +
    SPONSORED_PRE_VERIFICATION_GAS +
    SPONSORED_HANDLE_OPS_OVERHEAD;
  if (gas > MAX_SPONSORED_OUTER_GAS) throw new Error("Invalid sponsored gas limit");
  return gas;
}
export function gasBudget(baseFee: bigint, gas = SPONSORED_GAS) {
  if (gas < 21_000n || gas > MAX_SPONSORED_OUTER_GAS) throw new Error("Invalid sponsored gas limit");
  // Prefer a 2x+1 gwei buffer, but clamp to the 200 gwei cap so a 100 gwei Monad
  // testnet base fee can still sponsor instead of aborting every product send.
  const buffered = baseFee * 2n + 1_000_000_000n;
  const maxFeePerGas = buffered > MAX_SPONSORED_FEE ? MAX_SPONSORED_FEE : buffered;
  if (maxFeePerGas < baseFee) throw new Error("Testnet gas exceeds sponsorship limit");
  const maxPriorityFeePerGas =
    MONAD_PRIORITY_FEE < maxFeePerGas ? MONAD_PRIORITY_FEE : maxFeePerGas;
  return { gas, maxFeePerGas, maxPriorityFeePerGas };
}
export function sponsorshipId(wallet: Address, requestId: string, index: number) {
  const h = createHash("sha256")
    .update(`aim/testnet-gas/v1:${wallet.toLowerCase()}:${requestId}:${index}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Quota against the sponsor's outer handleOps cost. Never transfers MON to the APP wallet. */
export async function reserveSponsoredGas(
  wallet: Address,
  parentId: string,
  index: number,
  amount: bigint,
) {
  if (amount <= 0n) throw new Error("Invalid sponsored cost");
  await reserveGas(wallet, sponsorshipId(wallet, parentId, index), amount);
}
