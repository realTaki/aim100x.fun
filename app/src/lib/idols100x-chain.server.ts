import { createPublicClient, http, type Address } from "viem";
import type { FlexibleScene } from "@/lib/idols";
import { parseScenesJson } from "@/lib/idol-fields";
import { atomicAmountToUsdc, atomicToUsdc } from "@/lib/idol-pricing";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_DEMO_FIELDS,
  IDOLS100X_DEMO_TOKEN_IDS,
  IDOLS100X_IDOL_ABI,
  IDOLS100X_MINTER,
  IDOLS100X_RPC_URL,
} from "@/lib/idols100x";
import { DEFAULT_AMATEUR_SALE_USDC } from "@/lib/idol-amateur";
import { expectedMintedTokenIds, mergeMintedIdolReads } from "@/lib/minted-idol-merge";

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

export type MintedIdolOnChain = {
  tokenId: number;
  name: string;
  bio: string;
  personality: string;
  look: string;
  voice: string;
  website: string;
  twitter: string;
  welcome: string;
  scenes: FlexibleScene[];
  subscribePriceUsdc: number;
  imageUnlockPriceUsdc: number;
  salePriceUsdc: number;
  isPublic: boolean;
  subscriberCount: number;
  receiptsUsdc: number;
  /** ERC-721 owner. Contract address = true unsold-at-contract 素人. */
  owner: Address | null;
};

const MINTED_TTL_MS = 60_000;
let mintedCache: { at: number; value: MintedIdolOnChain[] } | null = null;

function emptyDemoIdol(tokenId: number): MintedIdolOnChain {
  const demo =
    tokenId in IDOLS100X_DEMO_FIELDS
      ? IDOLS100X_DEMO_FIELDS[tokenId as keyof typeof IDOLS100X_DEMO_FIELDS]
      : { name: "", bio: "", welcome: "", website: "", twitter: "", voice: "" };
  return {
    tokenId,
    name: demo.name,
    bio: demo.bio,
    personality: "",
    look: "",
    voice: demo.voice,
    website: demo.website,
    twitter: demo.twitter,
    welcome: demo.welcome,
    scenes: [],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: DEFAULT_AMATEUR_SALE_USDC,
    isPublic: true,
    subscriberCount: 0,
    receiptsUsdc: 0,
    owner: IDOLS100X_MINTER,
  };
}

/** Known demo tokens when RPC read fails (editor + plaza still load). */
export function mintedIdolsFromConstants(): MintedIdolOnChain[] {
  return IDOLS100X_DEMO_TOKEN_IDS.map((tokenId) => emptyDemoIdol(tokenId));
}

async function readMintedIdol(tokenId: number): Promise<MintedIdolOnChain | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const [view, owner, welcome] = await Promise.all([
        publicClient.readContract({
          address: IDOLS100X_ADDRESS as Address,
          abi: IDOLS100X_IDOL_ABI,
          functionName: "idolOf",
          args: [BigInt(tokenId)],
        }),
        publicClient
          .readContract({
            address: IDOLS100X_ADDRESS as Address,
            abi: IDOLS100X_IDOL_ABI,
            functionName: "ownerOf",
            args: [BigInt(tokenId)],
          })
          .catch(() => null),
        publicClient
          .readContract({
            address: IDOLS100X_ADDRESS as Address,
            abi: IDOLS100X_IDOL_ABI,
            functionName: "welcomeOf",
            args: [BigInt(tokenId)],
          })
          .catch(() => ""),
      ]);
      return {
        tokenId,
        name: view.name,
        bio: view.bio,
        personality: view.personality,
        look: view.look,
        voice: view.voice,
        website: view.website,
        twitter: view.twitter,
        welcome: typeof welcome === "string" ? welcome : "",
        scenes: parseScenesJson(view.scenes),
        subscribePriceUsdc: atomicToUsdc(view.subscribePriceUsdc),
        imageUnlockPriceUsdc: atomicToUsdc(view.imageUnlockPriceUsdc),
        salePriceUsdc: atomicAmountToUsdc(view.salePriceUsdc),
        isPublic: view.isPublic,
        subscriberCount: Number(view.subscriberCount),
        receiptsUsdc: atomicAmountToUsdc(view.receiptsUsdc),
        owner: owner as Address | null,
      };
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 200));
    }
  }
  return null;
}

export async function fetchMintedIdolTokens(
  force = false,
): Promise<MintedIdolOnChain[]> {
  if (!force && mintedCache && Date.now() - mintedCache.at < MINTED_TTL_MS) {
    return mintedCache.value;
  }
  const previous = mintedCache?.value ?? [];
  const fallback = mintedIdolsFromConstants();
  try {
    const next = await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "nextTokenId",
    });
    const last = Number(next);
    const expectedIds = expectedMintedTokenIds(
      last,
      previous.map((row) => row.tokenId),
      IDOLS100X_DEMO_TOKEN_IDS,
    );
    const fresh = (
      await Promise.all(expectedIds.map((tokenId) => readMintedIdol(tokenId)))
    ).filter((row): row is MintedIdolOnChain => Boolean(row));
    const value = mergeMintedIdolReads(expectedIds, [fallback, previous, fresh]);
    if (value.length === 0) {
      mintedCache = { at: Date.now(), value: fallback };
      return fallback;
    }
    mintedCache = { at: Date.now(), value };
    return value;
  } catch {
    const value =
      previous.length >= fallback.length
        ? previous
        : mergeMintedIdolReads(
            expectedMintedTokenIds(0, previous.map((row) => row.tokenId), IDOLS100X_DEMO_TOKEN_IDS),
            [fallback, previous],
          );
    mintedCache = { at: Date.now(), value };
    return value;
  }
}
