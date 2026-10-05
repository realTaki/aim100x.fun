import { keccak256, toBytes, type Hex } from "viem";
import {
  ENTRY_POINT_V06,
  PASSKEY_ACCOUNT_FACTORY,
  PASSKEY_PAYMASTER,
  PIMLICO_BUNDLER_URL,
} from "@/lib/auth/passkey-aa";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_EXPLORER,
  IDOLS100X_RPC_URL,
} from "@/lib/idols100x";

/** Product Streamable HTTP endpoint (Vercel production on `main`). */
export const REMOTE_MCP_URL = "https://lonelyfuns.vercel.app/mcp";

/** Same WebAuthn origin/rpId the software Agent Account already uses. */
export const AGENT_WEBAUTHN_ORIGIN = "https://agent.lonelyfuns.local";
export const AGENT_WEBAUTHN_RP_ID = "agent.lonelyfuns.local";

/** Domain-separated 32-byte challenge the agent signs; not a user id. */
export const MCP_AUTH_CHALLENGE: Hex = keccak256(toBytes("lonelyfuns.mcp.v1"));

export const MCP_BEARER_PREFIX = "lf1.";

/** Leave headroom under Vercel Hobby's 60s maxDuration. */
export const MCP_USEROP_WAIT_MS = 45_000;

export const MCP_CHAIN = {
  idols100x: IDOLS100X_ADDRESS,
  agentFactory: PASSKEY_ACCOUNT_FACTORY,
  paymaster: PASSKEY_PAYMASTER,
  entryPoint: ENTRY_POINT_V06,
  rpcUrl: IDOLS100X_RPC_URL,
  bundlerUrl: PIMLICO_BUNDLER_URL,
  explorerUrl: IDOLS100X_EXPLORER,
} as const;
