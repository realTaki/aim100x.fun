import { monadTransport } from "./monad-rpc.ts";
import { createPublicClient, http, type Address } from "viem";
import {
  IDOLS100X_CHAIN_ID,
  IDOLS100X_RPC_URL,
  LONELY_USD_ADDRESS,
} from "./idols100x.ts";

export const LONELY_USD_NAME = "LonelyUSD";
export const LONELY_USD_SYMBOL = "LUSD";
export const LONELY_USD_DECIMALS = 6;
/** `/me` deposit sheet: network and asset on one line. */
export const DEPOSIT_NETWORK_ASSET_LABEL = `Monad Testnet - ${LONELY_USD_SYMBOL}`;
export const DEPOSIT_OTHER_ASSET_WARNING =
  "Other assets may not work and could cause problems.";
export const LONELY_USD_FAUCET_AMOUNT = 100_000_000n;
export const LONELY_USD_FAUCET_COOLDOWN_SEC = 86_400;
export const LONELY_USD_FAUCET_CLAIM_LABEL = "+100 LUSD";
export const LONELY_USD_FAUCET_FAIL_MS = 2000;

export const LONELY_USD_ABI = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "faucetReadyAt",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "lastFaucetAt",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "FAUCET_AMOUNT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

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

export type LonelyUsdFaucetState = {
  balance: bigint;
  lastFaucetAt: bigint;
  readyAt: bigint;
};

export function readyAtFromLastClaim(lastFaucetAt: bigint): bigint {
  if (lastFaucetAt === 0n) return 0n;
  return lastFaucetAt + BigInt(LONELY_USD_FAUCET_COOLDOWN_SEC);
}

export function faucetRemainingSec(readyAt: bigint, nowSec: number): number {
  if (readyAt === 0n) return 0;
  const ready = Number(readyAt);
  if (!Number.isFinite(ready)) return 0;
  return Math.max(0, ready - nowSec);
}

export function formatFaucetCountdown(remainingSec: number): string {
  const total = Math.max(0, Math.floor(remainingSec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** `/me` display: full name, never the LUSD ticker. */
export function formatLonelyUsdAmount(usdc: number): string {
  const n = Number.isFinite(usdc) && usdc > 0 ? usdc : 0;
  const rounded = Math.round(n * 100) / 100;
  return `${rounded.toFixed(2)} ${LONELY_USD_NAME}`;
}

function faucetErrText(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const cause = err.cause != null ? faucetErrText(err.cause) : "";
    return `${err.name} ${err.message} ${cause}`.trim();
  }
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; shortMessage?: unknown; details?: unknown };
    return [o.message, o.shortMessage, o.details]
      .filter((v): v is string => typeof v === "string")
      .join(" ");
  }
  return "";
}

/** Short label for the `/me` +100 button. Never a toast. */
export function shortFaucetError(err: unknown): string {
  const t = faucetErrText(err).toLowerCase();
  if (/cooldown/.test(t)) return "Cooldown";
  if (/aa21|aa31|aa32|paymaster deposit|paymaster.*low|insufficient funds|didn't pay prefund/.test(t)) {
    return "Low gas";
  }
  if (/-32507|invalid.*signature|aa24/.test(t)) return "Sign failed";
  const aa = t.match(/\baa(\d{2})\b/);
  if (aa) return `AA${aa[1]}`;
  if (/out of gas|gas required exceeds/.test(t)) return "Low gas";
  if (/notallowederror|user rejected|user denied|cancelled|canceled|abort/.test(t)) {
    return "Canceled";
  }
  return "Claim failed";
}

export function faucetStateLanded(
  prev: { balance: bigint | null; lastFaucetAt: bigint; readyAt: bigint },
  next: { balance: bigint; lastFaucetAt: bigint; readyAt: bigint },
): boolean {
  if (next.lastFaucetAt !== prev.lastFaucetAt) return true;
  if (prev.balance === null) return next.balance > 0n || next.readyAt !== prev.readyAt;
  if (next.balance !== prev.balance) return true;
  return next.readyAt !== prev.readyAt;
}

export async function readLonelyUsdFaucetState(
  account: Address,
): Promise<LonelyUsdFaucetState> {
  const [balance, lastFaucetAt, readyAt] = await Promise.all([
    publicClient.readContract({
      address: LONELY_USD_ADDRESS,
      abi: LONELY_USD_ABI,
      functionName: "balanceOf",
      args: [account],
    }),
    publicClient.readContract({
      address: LONELY_USD_ADDRESS,
      abi: LONELY_USD_ABI,
      functionName: "lastFaucetAt",
      args: [account],
    }),
    publicClient.readContract({
      address: LONELY_USD_ADDRESS,
      abi: LONELY_USD_ABI,
      functionName: "faucetReadyAt",
      args: [account],
    }),
  ]);
  return {
    balance,
    lastFaucetAt,
    readyAt: readyAt === 0n ? readyAtFromLastClaim(lastFaucetAt) : readyAt,
  };
}
