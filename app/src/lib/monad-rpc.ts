import { createIsomorphicFn } from "@tanstack/react-start";
import { custom } from "viem";
import { assertTestnetRpc, RPC_UNAVAILABLE, rpcConfigurationMessage } from "./monad-rpc-policy.ts";
type RpcInput = { chainId: number; method: string; params?: readonly unknown[] };
const requestRpc = createIsomorphicFn()
  .server(async ({ chainId, method, params }: RpcInput) => {
    const { alchemyRequest } = await import("./monad-rpc.server.ts");
    return alchemyRequest(chainId, { method, params });
  })
  .client(async ({ chainId, method, params }: RpcInput) => {
    const response = await fetch(`/api/rpc?chainId=${chainId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await response.json();
    if (!response.ok || body.error)
      throw new Error(rpcConfigurationMessage(body.error?.code) ?? RPC_UNAVAILABLE);
    return body.result;
  });
export function monadTransport(chainId: number) {
  assertTestnetRpc(chainId);
  return custom(
    {
      request: ({ method, params }) =>
        requestRpc({ chainId, method, params: params as readonly unknown[] }),
    },
    { retryCount: 0 },
  );
}
