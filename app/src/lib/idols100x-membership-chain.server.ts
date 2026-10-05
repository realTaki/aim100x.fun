import { createPublicClient, http, type Address } from "viem";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_FAN_ABI,
  IDOLS100X_RPC_URL,
} from "@/lib/idols100x";
const monadChain = {
  id: IDOLS100X_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [IDOLS100X_RPC_URL] } },
};

const publicClient = createPublicClient({
  chain: monadChain,
  transport: http(IDOLS100X_RPC_URL),
});

const WALLET_USER_RE = /^0x[a-fA-F0-9]{40}$/;

/** Passkey `user.id` may be lowercase or checksummed. Chain reads are case-insensitive. */
export function walletAddressFromUserId(userId: string): Address | null {
  const trimmed = userId.trim();
  if (!WALLET_USER_RE.test(trimmed)) return null;
  return trimmed.toLowerCase() as Address;
}

export async function fanSubscribedOnChain(
  fan: Address,
  tokenId: number,
): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_FAN_ABI,
      functionName: "fanSubscribed",
      args: [BigInt(tokenId), fan],
    });
  } catch {
    return false;
  }
}

export async function subscribedTokenIdsForFan(fan: Address): Promise<number[]> {
  try {
    const ids = await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_FAN_ABI,
      functionName: "subscribedIdsOf",
      args: [fan],
    });
    return ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}
