import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { executeExternalCalls, type ExternalCall } from "./external-wallet";
import { externalWalletAddress } from "@/lib/subscribe/connected-wallet";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_FAN_ABI,
  IDOLS100X_IDOL_ABI,
  MONAD_TESTNET_USDC,
} from "@/lib/idols100x";
import { LONELY_USD_ABI } from "@/lib/lonely-usd";

// Legacy export names retained for product callers; every call is signed by the external wallet.
export type PasskeyCall = ExternalCall;
export function isPasskeyClientSession() {
  return externalWalletAddress() !== null;
}
export async function executePasskeyCalls(calls: ExternalCall[]): Promise<Hex> {
  const address = externalWalletAddress();
  if (!address) throw new Error("Sign in with an external wallet first");
  return executeExternalCalls(address, calls);
}
const ERC6551_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
] as const;

function approveUsdc(amount: bigint): PasskeyCall {
  return {
    to: MONAD_TESTNET_USDC,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [IDOLS100X_ADDRESS, amount],
    }),
  };
}

/** Faucet belongs to the external wallet, which signs and pays its transaction gas. */
export async function passkeyFaucet(): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: MONAD_TESTNET_USDC,
      data: encodeFunctionData({
        abi: LONELY_USD_ABI,
        functionName: "faucet",
      }),
    },
  ]);
}

export async function passkeySubscribe(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_FAN_ABI,
        functionName: "subscribe",
        args: [BigInt(tokenId)],
      }),
    },
  ]);
}

export async function passkeyPay(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_FAN_ABI,
        functionName: "pay",
        args: [BigInt(tokenId), amount],
      }),
    },
  ]);
}

export async function passkeyMint(amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "mint",
      }),
    },
  ]);
}

export async function passkeyBuy(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "buy",
        args: [BigInt(tokenId)],
      }),
    },
  ]);
}

export async function passkeySetSalePrice(tokenId: number, price: bigint): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setSalePrice",
        args: [BigInt(tokenId), price],
      }),
    },
  ]);
}

export async function passkeySetAgent(agent: Address, role: 1 | 2): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setAgent",
        args: [agent, role],
      }),
    },
  ]);
}

/** Revoke the current Agent Account for every idol owned by this account. */
export async function passkeyRemoveAgent(): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "removeAgent",
      }),
    },
  ]);
}

export async function passkeySetIdolPricing(
  tokenId: number,
  pricing: { subscribePriceUsdc: bigint; imageUnlockPriceUsdc: bigint },
) {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setIdolPricing",
        args: [BigInt(tokenId), pricing],
      }),
    },
  ]);
}

export async function passkeyWithdrawTba(tba: Address, to: Address, amount: bigint): Promise<Hex> {
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
  return executePasskeyCalls([
    {
      to: tba,
      data: encodeFunctionData({
        abi: ERC6551_EXECUTE_ABI,
        functionName: "execute",
        args: [MONAD_TESTNET_USDC, 0n, transferData, 0],
      }),
    },
  ]);
}
