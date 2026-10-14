import type { Address, Hex } from "viem";
import { rejectNonAppWalletWrites } from "./app-wallet-only.ts";
export type PasskeyCall = { to: Address; data: Hex; value?: bigint };
/** Old smart-account transactions are never a fallback for an APP operation. */
export async function executePasskeyCalls(_calls: PasskeyCall[]): Promise<Hex> {
  return rejectNonAppWalletWrites();
}
