import type { Hex } from "viem";
import { MCP_AUTH_CHALLENGE, MCP_BEARER_PREFIX } from "@/lib/mcp/constants";
import { signWebAuthn, type AgentWebAuthnKey } from "@/lib/mcp/envelope";

export type McpBearerPayload = {
  v: 1;
  x: Hex;
  y: Hex;
  sig: Hex;
  d?: Hex;
};

function hexCoord(value: string): Hex | null {
  const hex = value.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hex)) return null;
  return hex as Hex;
}

export function encodeMcpBearerToken(payload: McpBearerPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${MCP_BEARER_PREFIX}${b64}`;
}

export function parseMcpBearerToken(token: string): McpBearerPayload | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith(MCP_BEARER_PREFIX)) return null;
  try {
    const b64 = trimmed.slice(MCP_BEARER_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const json = atob(padded);
    const parsed = JSON.parse(json) as Partial<McpBearerPayload>;
    if (parsed.v !== 1) return null;
    const x = typeof parsed.x === "string" ? hexCoord(parsed.x) : null;
    const y = typeof parsed.y === "string" ? hexCoord(parsed.y) : null;
    const sig =
      typeof parsed.sig === "string" && /^0x[0-9a-fA-F]+$/.test(parsed.sig) ? (parsed.sig as Hex) : null;
    if (!x || !y || !sig) return null;
    const d = typeof parsed.d === "string" ? hexCoord(parsed.d) : undefined;
    return d ? { v: 1, x, y, sig, d } : { v: 1, x, y, sig };
  } catch {
    return null;
  }
}

export async function createMcpBearerToken(
  key: AgentWebAuthnKey,
  includePrivateKey: boolean,
): Promise<string> {
  const sig = await signWebAuthn(key, MCP_AUTH_CHALLENGE);
  const payload: McpBearerPayload = {
    v: 1,
    x: `0x${key.pubkeyX.toString(16).padStart(64, "0")}`,
    y: `0x${key.pubkeyY.toString(16).padStart(64, "0")}`,
    sig,
    ...(includePrivateKey ? { d: key.privateKey } : {}),
  };
  return encodeMcpBearerToken(payload);
}
