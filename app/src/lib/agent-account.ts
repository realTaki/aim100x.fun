import { monadTransport } from "./monad-rpc.ts";
import { createPublicClient, http, type Address, type Hex } from "viem";
import {
  PASSKEY_ACCOUNT_FACTORY,
  PASSKEY_FACTORY_ABI,
} from "@/lib/auth/passkey-aa";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_CHAIN_ID,
  IDOLS100X_IDOL_ABI,
  IDOLS100X_RPC_URL,
} from "@/lib/idols100x";
import { REMOTE_MCP_URL } from "@/lib/mcp/constants";
import { createMcpBearerToken } from "@/lib/mcp/token";

export type AgentRole = 1 | 2;

export type LocalAgentConfig = {
  version: 1;
  privateKey: Hex;
  pubkeyX: Hex;
  pubkeyY: Hex;
  agentAccount: Address;
  role: AgentRole;
  createdAt: string;
};

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

function storageKey(owner: Address): string {
  return `lonelyfuns.agent.v1.${IDOLS100X_ADDRESS.toLowerCase()}.${owner.toLowerCase()}`;
}

function hexFromBase64Url(value: string): Hex {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Generates an exportable software P-256 key for the separately-authorized Agent Account. */
export async function createLocalAgentConfig(role: AgentRole): Promise<LocalAgentConfig> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.privateKey),
    crypto.subtle.exportKey("jwk", pair.publicKey),
  ]);
  if (!privateJwk.d || !publicJwk.x || !publicJwk.y) throw new Error("Could not create agent key");

  const pubkeyX = hexFromBase64Url(publicJwk.x);
  const pubkeyY = hexFromBase64Url(publicJwk.y);
  const agentAccount = (await publicClient.readContract({
    address: PASSKEY_ACCOUNT_FACTORY,
    abi: PASSKEY_FACTORY_ABI,
    functionName: "getAddress",
    args: [BigInt(pubkeyX), BigInt(pubkeyY)],
  })) as Address;
  return {
    version: 1,
    privateKey: hexFromBase64Url(privateJwk.d),
    pubkeyX,
    pubkeyY,
    agentAccount,
    role,
    createdAt: new Date().toISOString(),
  };
}

export function loadLocalAgentConfig(owner: Address): LocalAgentConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(owner)) ?? "null") as LocalAgentConfig | null;
    if (
      !parsed ||
      parsed.version !== 1 ||
      (parsed.role !== 1 && parsed.role !== 2) ||
      !/^0x[0-9a-fA-F]{64}$/.test(parsed.privateKey) ||
      !/^0x[0-9a-fA-F]{40}$/.test(parsed.agentAccount)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveLocalAgentConfig(owner: Address, config: LocalAgentConfig): void {
  window.localStorage.setItem(storageKey(owner), JSON.stringify(config));
}

export function removeLocalAgentConfig(owner: Address): void {
  window.localStorage.removeItem(storageKey(owner));
}

export async function readOnChainAgent(owner: Address): Promise<{
  agent: Address;
  role: number;
} | null> {
  try {
    const authorization = (await publicClient.readContract({
      address: IDOLS100X_ADDRESS,
      abi: IDOLS100X_IDOL_ABI,
      functionName: "agentOf",
      args: [owner],
    })) as { agent: Address; role: number };
    return authorization.agent === "0x0000000000000000000000000000000000000000"
      ? null
      : authorization;
  } catch {
    return null;
  }
}

export function agentRoleLabel(role: AgentRole): string {
  return role === 2 ? "Full role (MCP content only; chain writes disabled)" : "Content management only";
}

/** Markdown is derived on demand; the persistent record never needs a second secret copy. */
export async function agentConfigMarkdown(config: LocalAgentConfig): Promise<string> {
  const token = await createMcpBearerToken(
    {
      privateKey: config.privateKey,
      pubkeyX: BigInt(config.pubkeyX),
      pubkeyY: BigInt(config.pubkeyY),
    },
    true,
  );
  return `# aim100x.fun Agent

> This text contains a signed MCP bearer token and the agent private key. Share it only with an agent you trust. aim100x.fun verifies the signature against the on-chain PasskeyAccount public key and does not store the key, a session, or any user record. Revoke or reset the agent to invalidate it.

- Chain: Monad Testnet (10143)
- Idols100x: \`${IDOLS100X_ADDRESS}\`
- Agent Account: \`${config.agentAccount}\`
- Permission: ${agentRoleLabel(config.role)}
- MCP URL: \`${REMOTE_MCP_URL}\`

## Codex (Streamable HTTP)

The token stays in your shell. Do not paste it into Vercel env vars.

\`\`\`bash
export LONELYFUNS_MCP_TOKEN='${token}'
codex mcp add aim100x --url ${REMOTE_MCP_URL} --bearer-token-env-var LONELYFUNS_MCP_TOKEN
\`\`\`

Codex sends \`Authorization: Bearer $LONELYFUNS_MCP_TOKEN\` on every request. Optional \`~/.codex/config.toml\`:

\`\`\`toml
[mcp_servers.aim100x]
url = "${REMOTE_MCP_URL}"
bearer_token_env_var = "LONELYFUNS_MCP_TOKEN"
tool_timeout_sec = 60
\`\`\`

## Cursor / Claude

\`\`\`json
${JSON.stringify(
  {
    mcpServers: {
      aim100x: {
        url: REMOTE_MCP_URL,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  },
  null,
  2,
)}
\`\`\`
`;
}
