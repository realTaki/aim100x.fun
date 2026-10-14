/** Shared policy contains no endpoint credentials and is safe for the browser. */
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const RPC_MISSING_CONFIG = -32001;
export const RPC_INVALID_CONFIG = -32002;
export const RPC_UNAVAILABLE = "Alchemy testnet RPC unavailable or chain mismatch";

export function assertTestnetRpc(chainId: number): void {
  if (chainId === 143) throw new Error("Monad mainnet RPC is disabled");
  if (chainId !== MONAD_TESTNET_CHAIN_ID) throw new Error("Unsupported Monad chain");
}

export function rpcConfigurationMessage(code: number): string | undefined {
  if (code === RPC_MISSING_CONFIG) return "ALCHEMY_MONAD_TESTNET_RPC_URL is required on the server";
  if (code === RPC_INVALID_CONFIG)
    return "ALCHEMY_MONAD_TESTNET_RPC_URL must be the Alchemy testnet HTTPS endpoint";
}
