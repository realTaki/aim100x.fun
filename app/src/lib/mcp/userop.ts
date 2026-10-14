import type { Hex } from "viem";
import type { McpAgentSession } from "./auth.server.ts";
import { rejectNonAppWalletWrites } from "../auth/app-wallet-only.ts";
/** Keep legacy import compatibility; MCP has no authenticated APP signer yet. */
export async function executeAgentCall(_session: McpAgentSession, _data: Hex): Promise<Hex> {
  return rejectNonAppWalletWrites();
}
