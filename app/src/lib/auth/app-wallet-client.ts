import type { Address } from "viem";
import { getLiveWalletSessionRow } from "./client";
/** Server-derived APP wallet for testnet product ownership and payments. */
export function appWalletAddress(): Address | null {
  const address = getLiveWalletSessionRow()?.walletAddress;
  return address && /^0x[a-f0-9]{40}$/i.test(address) ? (address as Address) : null;
}
