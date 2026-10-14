import { monadTransport } from "../monad-rpc.ts";
import { findRpcConfigurationError } from "../monad-rpc.server.ts";
import { createPublicClient, http, type Address, type Hex } from "viem";
import {
  PASSKEY_ACCOUNT_ABI,
  PASSKEY_FACTORY_ABI,
} from "@/lib/auth/passkey-aa";
import { IDOLS100X_CHAIN_ID } from "@/lib/idols100x";
import {
  MCP_AUTH_CHALLENGE,
  MCP_CHAIN,
  MCP_USEROP_WAIT_MS,
} from "@/lib/mcp/constants";
import { credentialIdFromPubkey, signWebAuthn } from "@/lib/mcp/envelope";
import { deriveAgentPublic, parseP256PrivateKey } from "@/lib/mcp/derive.server";
import { parseMcpBearerToken } from "@/lib/mcp/token";
import { verifyWebAuthn } from "@/lib/mcp/verify.server";

export type McpAgentSession = {
  pubkeyX: bigint;
  pubkeyY: bigint;
  credentialId: Hex;
  agentAccount: Address;
  privateKey?: Hex;
  idols100x: Address;
  agentFactory: Address;
  paymaster: Address;
  rpcUrl: string;
  bundlerUrl: string;
  explorerUrl: string;
  userOpTimeoutMs: number;
};

export type McpAuthResult = { ok: true; session: McpAgentSession } | { ok: false };

const publicClient = createPublicClient({
  chain: {
    id: IDOLS100X_CHAIN_ID,
    name: "Monad Testnet",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [MCP_CHAIN.rpcUrl] } },
  },
  transport: monadTransport(10143),
});

function bearerFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? null;
}

function rawPrivateKey(value: string): Hex | null {
  try {
    return parseP256PrivateKey(value);
  } catch {
    return null;
  }
}

async function bindOnChain(pubkeyX: bigint, pubkeyY: bigint): Promise<Address | null> {
  try {
    const agentAccount = await publicClient.readContract({
      address: MCP_CHAIN.agentFactory,
      abi: PASSKEY_FACTORY_ABI,
      functionName: "getAddress",
      args: [pubkeyX, pubkeyY],
    });
    const code = await publicClient.getCode({ address: agentAccount });
    if (code && code !== "0x") {
      const [onChainX, onChainY] = await Promise.all([
        publicClient.readContract({
          address: agentAccount,
          abi: PASSKEY_ACCOUNT_ABI,
          functionName: "pubkeyX",
        }),
        publicClient.readContract({
          address: agentAccount,
          abi: PASSKEY_ACCOUNT_ABI,
          functionName: "pubkeyY",
        }),
      ]);
      if (onChainX !== pubkeyX || onChainY !== pubkeyY) return null;
    }
    return agentAccount;
  } catch (error) {
    const config = findRpcConfigurationError(error);
    if (config) throw config;
    return null;
  }
}

async function sessionFromProof(input: {
  pubkeyX: bigint;
  pubkeyY: bigint;
  sig: Hex;
  privateKey?: Hex;
}): Promise<McpAgentSession | null> {
  if (!verifyWebAuthn(input.sig, MCP_AUTH_CHALLENGE, input.pubkeyX, input.pubkeyY)) {
    return null;
  }
  if (input.privateKey) {
    const derived = deriveAgentPublic(input.privateKey);
    if (derived.pubkeyX !== input.pubkeyX || derived.pubkeyY !== input.pubkeyY) return null;
  }
  const agentAccount = await bindOnChain(input.pubkeyX, input.pubkeyY);
  if (!agentAccount) return null;
  return {
    pubkeyX: input.pubkeyX,
    pubkeyY: input.pubkeyY,
    credentialId: await credentialIdFromPubkey(input.pubkeyX, input.pubkeyY),
    agentAccount,
    privateKey: input.privateKey,
    ...MCP_CHAIN,
    userOpTimeoutMs: MCP_USEROP_WAIT_MS,
  };
}

/**
 * Stateless MCP auth: verify the agent P-256 WebAuthn envelope, bind it to the
 * on-chain PasskeyAccount public key, and keep any private key in this request
 * only. Never logs the token, key, or pubkey.
 */
export async function authenticateMcpRequest(request: Request): Promise<McpAuthResult> {
  const token = bearerFromRequest(request);
  const headerKey = request.headers.get("x-lonelyfuns-agent-key");
  if (!token) return { ok: false };

  const payload = parseMcpBearerToken(token);
  if (payload) {
    let privateKey: Hex | undefined = payload.d;
    if (!privateKey && headerKey) {
      try {
        privateKey = parseP256PrivateKey(headerKey);
      } catch {
        return { ok: false };
      }
    }
    const session = await sessionFromProof({
      pubkeyX: BigInt(payload.x),
      pubkeyY: BigInt(payload.y),
      sig: payload.sig,
      privateKey,
    });
    return session ? { ok: true, session } : { ok: false };
  }

  const privateKey = rawPrivateKey(token);
  if (!privateKey) return { ok: false };
  const derived = deriveAgentPublic(privateKey);
  const sig = await signWebAuthn({ privateKey, ...derived }, MCP_AUTH_CHALLENGE);
  const session = await sessionFromProof({
    pubkeyX: derived.pubkeyX,
    pubkeyY: derived.pubkeyY,
    sig,
    privateKey,
  });
  return session ? { ok: true, session } : { ok: false };
}

export function mcpUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="lonelyfuns", error="invalid_token"',
      "Cache-Control": "no-store",
    },
  });
}
