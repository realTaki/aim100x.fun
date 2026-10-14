import { monadTransport } from "../monad-rpc.ts";
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
  transport: monadTransport(10143),
});

export async function fanSubscribedOnChainClient(
  fan: Address,
  tokenId: number,
): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: IDOLS100X_ADDRESS,
      abi: IDOLS100X_FAN_ABI,
      functionName: "fanSubscribed",
      args: [BigInt(tokenId), fan],
    });
  } catch {
    return false;
  }
}

/** Same wallet + contract as `fanSubscribed` / passkey `subscribe`. */
export async function subscribedIdsOfOnChainClient(fan: Address): Promise<number[]> {
  try {
    const ids = await publicClient.readContract({
      address: IDOLS100X_ADDRESS,
      abi: IDOLS100X_FAN_ABI,
      functionName: "subscribedIdsOf",
      args: [fan],
    });
    return ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}
