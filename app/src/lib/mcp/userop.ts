import { monadTransport } from "../monad-rpc.ts";
import {
  concat,
  createPublicClient,
  encodeFunctionData,
  http,
  toHex,
  type Address,
  type Hex,
} from "viem";
import {
  ENTRY_POINT_ABI,
  PASSKEY_ACCOUNT_ABI,
  PASSKEY_FACTORY_ABI,
} from "@/lib/auth/passkey-aa";
import { IDOLS100X_CHAIN_ID } from "@/lib/idols100x";
import { MCP_CHAIN } from "@/lib/mcp/constants";
import type { McpAgentSession } from "@/lib/mcp/auth.server";
import { signWebAuthn } from "@/lib/mcp/envelope";

const CALL_GAS_FLOOR = 500_000n;
const VERIFICATION_GAS = 1_500_000n;
const VERIFICATION_GAS_DEPLOY = 2_000_000n;
const PRE_VERIFICATION_GAS_FLOOR = 4_200_000n;

type UserOperation = {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
};

type UserOpReceipt = {
  success?: boolean;
  reason?: string;
  revertReason?: string;
  receipt?: { transactionHash?: Hex; status?: Hex };
} | null;

function rpcUserOp(op: UserOperation) {
  return {
    sender: op.sender,
    nonce: toHex(op.nonce),
    initCode: op.initCode,
    callData: op.callData,
    callGasLimit: toHex(op.callGasLimit),
    verificationGasLimit: toHex(op.verificationGasLimit),
    preVerificationGas: toHex(op.preVerificationGas),
    maxFeePerGas: toHex(op.maxFeePerGas),
    maxPriorityFeePerGas: toHex(op.maxPriorityFeePerGas),
    paymasterAndData: op.paymasterAndData,
    signature: op.signature,
  };
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "Unknown bundler error";
  const value = error as { message?: unknown; data?: unknown };
  return [
    typeof value.message === "string" ? value.message : "",
    value.data ? errorText(value.data) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

async function bundler<T>(session: McpAgentSession, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(session.bundlerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "lonelyfuns-mcp",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  let body: { result?: T; error?: unknown };
  try {
    body = JSON.parse(text) as { result?: T; error?: unknown };
  } catch {
    throw new Error(text.slice(0, 300) || `Bundler HTTP ${response.status}`);
  }
  if (body.error) throw new Error(errorText(body.error));
  if (body.result === undefined) throw new Error(`Bundler returned no result for ${method}`);
  return body.result;
}

function bump(current: bigint, estimate?: Hex): bigint {
  if (!estimate) return current;
  const padded = (BigInt(estimate) * 13n) / 10n;
  return padded > current ? padded : current;
}

function requirePrivateKey(session: McpAgentSession): Hex {
  if (!session.privateKey) {
    throw new Error(
      "Writes need the agent key in the bearer token (request RAM only; never stored on the server)",
    );
  }
  return session.privateKey;
}

export async function executeAgentCall(session: McpAgentSession, data: Hex): Promise<Hex> {
  const privateKey = requirePrivateKey(session);
  const key = { privateKey, pubkeyX: session.pubkeyX, pubkeyY: session.pubkeyY };
  const client = createPublicClient({
    chain: {
      id: IDOLS100X_CHAIN_ID,
      name: "Monad Testnet",
      nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
      rpcUrls: { default: { http: [session.rpcUrl] } },
    },
    transport: monadTransport(10143),
  });
  const sender = session.agentAccount;
  const code = await client.getCode({ address: sender });
  const nonce = await client.readContract({
    address: MCP_CHAIN.entryPoint,
    abi: ENTRY_POINT_ABI,
    functionName: "getNonce",
    args: [sender, 0n],
  });
  const initCode =
    code && code !== "0x"
      ? ("0x" as Hex)
      : concat([
          session.agentFactory,
          encodeFunctionData({
            abi: PASSKEY_FACTORY_ABI,
            functionName: "createAccount",
            args: [session.pubkeyX, session.pubkeyY, session.credentialId],
          }),
        ]);
  const callData = encodeFunctionData({
    abi: PASSKEY_ACCOUNT_ABI,
    functionName: "execute",
    args: [session.idols100x, 0n, data],
  });
  const prices = await bundler<{
    fast?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
    standard?: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
  }>(session, "pimlico_getUserOperationGasPrice", []);
  const fee = prices.fast ?? prices.standard;
  if (!fee) throw new Error("Bundler did not return gas prices");

  const op: UserOperation = {
    sender,
    nonce,
    initCode,
    callData,
    callGasLimit: CALL_GAS_FLOOR,
    verificationGasLimit: initCode === "0x" ? VERIFICATION_GAS : VERIFICATION_GAS_DEPLOY,
    preVerificationGas: PRE_VERIFICATION_GAS_FLOOR,
    maxFeePerGas: BigInt(fee.maxFeePerGas),
    maxPriorityFeePerGas: BigInt(fee.maxPriorityFeePerGas),
    paymasterAndData: session.paymaster,
    signature: await signWebAuthn(key, `0x${"00".repeat(32)}`),
  };

  try {
    const estimate = await bundler<{
      callGasLimit?: Hex;
      verificationGasLimit?: Hex;
      preVerificationGas?: Hex;
    }>(session, "eth_estimateUserOperationGas", [rpcUserOp(op), MCP_CHAIN.entryPoint]);
    op.callGasLimit = bump(op.callGasLimit, estimate.callGasLimit);
    op.verificationGasLimit = bump(op.verificationGasLimit, estimate.verificationGasLimit);
    op.preVerificationGas = bump(op.preVerificationGas, estimate.preVerificationGas);
  } catch (error) {
    console.error("[mcp] gas estimate fallback:", errorText(error));
  }

  const userOpHash = await client.readContract({
    address: MCP_CHAIN.entryPoint,
    abi: ENTRY_POINT_ABI,
    functionName: "getUserOpHash",
    args: [op],
  });
  op.signature = await signWebAuthn(key, userOpHash);
  const hash = await bundler<Hex>(session, "eth_sendUserOperation", [
    rpcUserOp(op),
    MCP_CHAIN.entryPoint,
  ]);
  return waitForReceipt(session, hash);
}

async function waitForReceipt(session: McpAgentSession, userOpHash: Hex): Promise<Hex> {
  const started = Date.now();
  while (Date.now() - started < session.userOpTimeoutMs) {
    const mined = await bundler<UserOpReceipt>(session, "eth_getUserOperationReceipt", [userOpHash]);
    if (mined?.success === false) {
      throw new Error(mined.reason || mined.revertReason || "UserOperation reverted");
    }
    const hash = mined?.receipt?.transactionHash;
    if (mined?.success === true && hash) return hash;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error("Timed out waiting for UserOperation");
}
