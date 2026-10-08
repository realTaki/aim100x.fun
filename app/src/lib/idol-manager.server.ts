import { createPublicClient, http, type Address } from "viem";
import type { ManagerHub } from "@/lib/idol-catalog";
import type { Idol } from "@/lib/idols";
import { canMintAmateur, DEFAULT_AMATEUR_SALE_USDC } from "@/lib/idol-amateur";
import { loadIdolCatalog } from "@/lib/idol-catalog.server";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_IDOL_ABI,
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

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/;

export async function fetchIdolTokenOwnerServer(tokenId: number): Promise<Address | null> {
  try {
    const owner = await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    return owner as Address;
  } catch {
    return null;
  }
}

export function normalizeWalletAddress(wallet: string): `0x${string}` | null {
  const trimmed = wallet.trim();
  if (!WALLET_RE.test(trimmed)) return null;
  return trimmed as `0x${string}`;
}

export async function isWalletIdolManager(wallet: string, tokenId: number): Promise<boolean> {
  const normalized = normalizeWalletAddress(wallet);
  if (!normalized) return false;
  const owner = await fetchIdolTokenOwnerServer(tokenId);
  return owner?.toLowerCase() === normalized.toLowerCase();
}

async function fetchMintSlot(wallet: Address): Promise<ManagerHub["nextAmateur"]> {
  try {
    const [mintsOf, nextTokenId] = await Promise.all([
      publicClient.readContract({
        address: IDOLS100X_ADDRESS as Address,
        abi: IDOLS100X_IDOL_ABI,
        functionName: "mintsOf",
        args: [wallet],
      }),
      publicClient.readContract({
        address: IDOLS100X_ADDRESS as Address,
        abi: IDOLS100X_IDOL_ABI,
        functionName: "nextTokenId",
      }),
    ]);
    const minted = Number(mintsOf);
    if (!canMintAmateur(minted, Number(nextTokenId))) return null;
    return { salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC, mintsOf: minted };
  } catch {
    return { salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC, mintsOf: 0 };
  }
}

export async function loadOwnedIdolsForWallet(wallet: string, force = false): Promise<Idol[]> {
  const hub = await loadManagerHub(wallet, force);
  return hub.owned;
}

export async function loadManagerHub(wallet: string, force = false): Promise<ManagerHub> {
  const normalized = normalizeWalletAddress(wallet);
  if (!normalized) return { owned: [], nextAmateur: null };
  const catalog = await loadIdolCatalog(force);
  const owned: Idol[] = [];
  for (const token of catalog.minted) {
    const owner = token.owner ?? (await fetchIdolTokenOwnerServer(token.tokenId));
    if (owner?.toLowerCase() !== normalized.toLowerCase()) continue;
    const idol = catalog.idols.find((i) => i.tokenId === token.tokenId);
    if (idol) owned.push(idol);
  }
  return {
    owned,
    nextAmateur: await fetchMintSlot(normalized),
  };
}

export async function loadManagedIdolForWallet(
  tokenId: number,
  wallet: string,
): Promise<Idol | null> {
  const normalized = normalizeWalletAddress(wallet);
  if (!normalized) return null;
  const catalog = await loadIdolCatalog();
  const token = catalog.minted.find((t) => t.tokenId === tokenId);
  if (!token) return null;
  const owner = token.owner ?? (await fetchIdolTokenOwnerServer(token.tokenId));
  if (owner?.toLowerCase() !== normalized.toLowerCase()) return null;
  return catalog.idols.find((i) => i.tokenId === tokenId) ?? null;
}

/** Private configuration reads/writes require the current external-wallet owner. */
export async function requireIdolManager(tokenId: number, userId: string, bearerToken?: string) {
  const { getSessionUser } = await import("./auth/verify.server");
  const user = await getSessionUser(bearerToken);
  if (!user || user.id !== userId || !(await isWalletIdolManager(user.id, tokenId)))
    throw new Error("Not the idol manager");
  return user.id as Address;
}
