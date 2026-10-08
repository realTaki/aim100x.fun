import { createPublicClient, http, type Address } from "viem";
import { usdcToAtomicOrZero } from "@/lib/idol-pricing";
import { externalWalletAddress } from "@/lib/subscribe/connected-wallet";
import {
  passkeyBuy,
  passkeyMint,
  passkeySetIdolPricing,
  passkeySetSalePrice,
  passkeyWithdrawTba,
} from "@/lib/auth/passkey-client";
import {
  IDOLS100X_ABI,
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_IDOL_ABI,
  IDOLS100X_RPC_URL,
  MONAD_TESTNET_USDC,
  DEFAULT_SALE_PRICE_USDC_ATOMIC,
  subscribePayTo,
} from "@/lib/idols100x";
import { isIdolManagerWallet } from "@/lib/idol-manager-wallet";
import { PASSKEY_ACCOUNT_ABI } from "@/lib/auth/passkey-aa";

const monadChain = {
  id: IDOLS100X_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [IDOLS100X_RPC_URL] } },
};

const IDOLS100X_MANAGER_ABI = IDOLS100X_IDOL_ABI;

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const publicClient = createPublicClient({
  chain: monadChain,
  transport: http(IDOLS100X_RPC_URL),
});

export async function fetchIdolTokenOwner(tokenId: number): Promise<Address | null> {
  try {
    const owner = await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_MANAGER_ABI,
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    });
    return owner as Address;
  } catch {
    return null;
  }
}

export async function fetchPasskeyPublicKey(
  address: Address,
): Promise<{ x: bigint; y: bigint } | null> {
  try {
    const [x, y] = await Promise.all([
      publicClient.readContract({ address, abi: PASSKEY_ACCOUNT_ABI, functionName: "pubkeyX" }),
      publicClient.readContract({ address, abi: PASSKEY_ACCOUNT_ABI, functionName: "pubkeyY" }),
    ]);
    return { x: x as bigint, y: y as bigint };
  } catch {
    return null;
  }
}

export { isIdolManagerWallet };

export const writeIdolPricingOnChain = passkeySetIdolPricing;

export async function resolveIdolTbaAddress(tokenId: number): Promise<Address | null> {
  const cached = subscribePayTo(tokenId);
  if (cached) return cached;
  try {
    const tba = await publicClient.readContract({
      address: IDOLS100X_ADDRESS as Address,
      abi: IDOLS100X_ABI,
      functionName: "tokenBoundAccount",
      args: [BigInt(tokenId)],
    });
    return tba as Address;
  } catch {
    return null;
  }
}

export async function fetchTbaUsdcBalance(tba: Address): Promise<bigint> {
  try {
    return await publicClient.readContract({
      address: MONAD_TESTNET_USDC as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [tba],
    });
  } catch {
    return 0n;
  }
}

export async function writeIdolSalePriceOnChain(
  tokenId: number,
  salePriceUsdc: number,
): Promise<`0x${string}`> {
  return passkeySetSalePrice(tokenId, usdcToAtomicOrZero(salePriceUsdc));
}

export async function mintIdolOnChain(): Promise<`0x${string}`> {
  const price = DEFAULT_SALE_PRICE_USDC_ATOMIC;
  const address = externalWalletAddress();
  if (address) {
    const balance = await publicClient.readContract({
      address: MONAD_TESTNET_USDC as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < price) throw new Error("ERC20InsufficientBalance");
  }
  return passkeyMint(price);
}

export async function buyIdolOnChain(tokenId: number): Promise<`0x${string}`> {
  const price = await publicClient.readContract({
    address: IDOLS100X_ADDRESS as Address,
    abi: IDOLS100X_MANAGER_ABI,
    functionName: "salePriceUsdcOf",
    args: [BigInt(tokenId)],
  });
  const address = externalWalletAddress();
  if (address) {
    const balance = await publicClient.readContract({
      address: MONAD_TESTNET_USDC as Address,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    });
    if (balance < price) throw new Error("ERC20InsufficientBalance");
  }
  return passkeyBuy(tokenId, price);
}

/**
 * NFT owner withdraws all USDC from the idol ERC-6551 TBA to their wallet.
 * Non-owners fail in the app and on-chain (TBA only accepts execute from token owner).
 */
export async function withdrawIdolTbaUsdcToOwner(tokenId: number): Promise<`0x${string}`> {
  const address = externalWalletAddress();
  if (!address) throw new Error("Sign in with a wallet first");
  const wallet = address;
  const owner = await fetchIdolTokenOwner(tokenId);
  if (!isIdolManagerWallet(owner, wallet)) {
    throw new Error("Couldn't save");
  }

  const tba = await resolveIdolTbaAddress(tokenId);
  if (!tba) throw new Error("Could not resolve idol token-bound account");

  const balance = await fetchTbaUsdcBalance(tba);
  if (balance <= 0n) throw new Error("No USDC balance on this idol TBA");

  return passkeyWithdrawTba(tba, wallet, balance);
}
