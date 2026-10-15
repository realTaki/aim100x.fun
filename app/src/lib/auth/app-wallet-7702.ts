import {
  decodeFunctionData,
  encodeFunctionData,
  padHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { APP_ACCOUNT_IMPLEMENTATION, APP_ENTRY_POINT } from "./app-wallet-chain.ts";

export const SIMPLE_7702_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const ENTRY_POINT_ABI = [
  {
    type: "function",
    name: "handleOps",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "ops",
        type: "tuple[]",
        components: [
          { name: "sender", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "initCode", type: "bytes" },
          { name: "callData", type: "bytes" },
          { name: "accountGasLimits", type: "bytes32" },
          { name: "preVerificationGas", type: "uint256" },
          { name: "gasFees", type: "bytes32" },
          { name: "paymasterAndData", type: "bytes" },
          { name: "signature", type: "bytes" },
        ],
      },
      { name: "beneficiary", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getNonce",
    stateMutability: "view",
    inputs: [
      { name: "sender", type: "address" },
      { name: "key", type: "uint192" },
    ],
    outputs: [{ name: "nonce", type: "uint256" }],
  },
] as const;

export type PackedUserOperation = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
};

export const PACKED_USER_OP_TYPES = {
  PackedUserOperation: [
    { name: "sender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "initCode", type: "bytes" },
    { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" },
    { name: "preVerificationGas", type: "uint256" },
    { name: "gasFees", type: "bytes32" },
    { name: "paymasterAndData", type: "bytes" },
  ],
} as const;

/** EIP-7702 delegation indicator for Simple7702Account. */
export function appWalletDelegationCode(
  implementation: Address = APP_ACCOUNT_IMPLEMENTATION,
): Hex {
  return `0xef0100${implementation.slice(2)}`.toLowerCase() as Hex;
}

export function packUint128Pair(high: bigint, low: bigint): Hex {
  if (high < 0n || low < 0n || high >= 1n << 128n || low >= 1n << 128n)
    throw new Error("Invalid packed gas field");
  return padHex(toHex((high << 128n) | low), { size: 32 });
}

export function encodeAccountExecute(call: { to: Address; value: bigint; data: Hex }): Hex {
  return encodeFunctionData({
    abi: SIMPLE_7702_ABI,
    functionName: "execute",
    args: [call.to, call.value, call.data],
  });
}

export function userOperationTypedData(userOp: Omit<PackedUserOperation, "signature">, chainId = 10143) {
  return {
    domain: {
      name: "ERC4337",
      version: "1",
      chainId,
      verifyingContract: APP_ENTRY_POINT,
    },
    types: PACKED_USER_OP_TYPES,
    primaryType: "PackedUserOperation" as const,
    message: {
      sender: userOp.sender,
      nonce: userOp.nonce,
      initCode: userOp.initCode,
      callData: userOp.callData,
      accountGasLimits: userOp.accountGasLimits,
      preVerificationGas: userOp.preVerificationGas,
      gasFees: userOp.gasFees,
      paymasterAndData: userOp.paymasterAndData,
    },
  };
}

export function encodeHandleOps(ops: PackedUserOperation[], beneficiary: Address): Hex {
  return encodeFunctionData({
    abi: ENTRY_POINT_ABI,
    functionName: "handleOps",
    args: [ops, beneficiary],
  });
}

export type SponsoredInnerCall = {
  sender: Address;
  to: Address;
  value: bigint;
  data: Hex;
  beneficiary: Address;
};

/** Decode a sponsor-submitted EntryPoint.handleOps that executes one Simple7702 call. */
export function sponsoredCallFromHandleOps(input: Hex): SponsoredInnerCall | null {
  try {
    const decoded = decodeFunctionData({ abi: ENTRY_POINT_ABI, data: input });
    if (decoded.functionName !== "handleOps") return null;
    const [ops, beneficiary] = decoded.args;
    if (ops.length !== 1) return null;
    const inner = decodeFunctionData({ abi: SIMPLE_7702_ABI, data: ops[0].callData });
    if (inner.functionName !== "execute") return null;
    return {
      sender: ops[0].sender,
      to: inner.args[0],
      value: inner.args[1],
      data: inner.args[2],
      beneficiary,
    };
  } catch {
    return null;
  }
}
