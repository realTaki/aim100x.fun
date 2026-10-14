import { monad, monadTestnet } from "viem/chains";
import { IDOLS100X_RPC_URL } from "../idols100x.ts";
export const APP_ENTRY_POINT = "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as const;
export const APP_ACCOUNT_IMPLEMENTATION = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;
export const MONAD_USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603" as const;
export const testnetWalletChain = {
  ...monadTestnet,
  rpcUrls: { default: { http: [IDOLS100X_RPC_URL] } },
};
export const mainnetWalletChain = {
  ...monad,
  rpcUrls: { default: { http: ["/api/rpc?chainId=143"] } },
};
