import type { Address, Chain, EIP1193Provider, Hex } from "viem";
import { rejectNonAppWalletWrites } from "./app-wallet-only.ts";
export type ExternalCall = { to: Address; data: Hex; value?: bigint };
/** Compatibility tombstone: external wallets authenticate in client.ts only. */
export async function externalSigningClient(
  _expected: Address,
  _chain: Chain,
  _provider?: EIP1193Provider,
): Promise<never> {
  return rejectNonAppWalletWrites();
}
export async function executeExternalCalls(
  _expected: Address,
  _calls: ExternalCall[],
  _deps: {
    provider?: EIP1193Provider;
    onSubmitted?: (hash: Hex, index: number) => void;
    waitForReceipt?: (hash: Hex) => Promise<{ status: "success" | "reverted" }>;
  } = {},
): Promise<Hex> {
  return rejectNonAppWalletWrites();
}
