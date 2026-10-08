import type { Address } from "viem";
import { getLiveWalletSessionRow } from "./client";
/** Derived mainnet API wallet; never use this address for NFT ownership or product calls. */
export function appWalletAddress(): Address | null {
  const address = getLiveWalletSessionRow()?.walletAddress;
  return address && /^0x[a-f0-9]{40}$/i.test(address) ? (address as Address) : null;
}
