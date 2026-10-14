import type { Address } from "viem";
import { getLiveWalletSessionRow } from "./client";
/** Derived APP wallet: product ownership on testnet and API payments on mainnet. */
export function appWalletAddress(): Address | null {
  const address = getLiveWalletSessionRow()?.walletAddress;
  return address && /^0x[a-f0-9]{40}$/i.test(address) ? (address as Address) : null;
}
