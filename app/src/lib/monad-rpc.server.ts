import {
  assertTestnetRpc,
  MONAD_TESTNET_CHAIN_ID,
  RPC_MISSING_CONFIG,
  RPC_INVALID_CONFIG,
  RPC_UNAVAILABLE,
  rpcConfigurationMessage,
} from "./monad-rpc-policy.ts";

export class RpcConfigurationError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(rpcConfigurationMessage(code));
    this.code = code;
  }
}

/** viem wraps transport errors; expose only our own safe configuration errors. */
export function findRpcConfigurationError(error: unknown): RpcConfigurationError | undefined {
  for (let i = 0; i < 12 && error instanceof Error; i++, error = error.cause) {
    if (error instanceof RpcConfigurationError) return error;
  }
}

/** Alchemy URLs stay on the server; errors never include the URL or API key. */
export function alchemyRpcUrl(chainId: number, env = process.env): string {
  assertTestnetRpc(chainId);
  const raw = env.ALCHEMY_MONAD_TESTNET_RPC_URL;
  if (!raw) throw new RpcConfigurationError(RPC_MISSING_CONFIG);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RpcConfigurationError(RPC_INVALID_CONFIG);
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "monad-testnet.g.alchemy.com" ||
    !/^\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    url.port
  )
    throw new RpcConfigurationError(RPC_INVALID_CONFIG);
  return url.toString();
}
export type RpcRequest = { method: string; params?: readonly unknown[] };
const READ_METHODS = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
]);

export async function alchemyRequest(
  chainId: number,
  request: RpcRequest,
  fetcher = fetch,
  env = process.env,
) {
  const url = alchemyRpcUrl(chainId, env);
  // Signing stays in the wallet; UserOperations belong to the separate bundler.
  if (!READ_METHODS.has(request.method) && request.method !== "eth_sendRawTransaction")
    throw new Error("Unsupported Alchemy RPC method");
  async function send(input: RpcRequest) {
    const response = await fetcher(url, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...input }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error();
    const body = await response.json();
    if (body?.error) {
      const e = new Error("Alchemy RPC request rejected") as Error & {
        code: number;
        data?: string;
      };
      // Only the standard revert code/bytes survive; never reflect provider messages.
      e.code = body.error.code === 3 ? 3 : -32603;
      if (typeof body.error.data === "string" && /^0x[a-f0-9]{0,8192}$/i.test(body.error.data))
        e.data = body.error.data;
      throw e;
    }
    if (!body || body.jsonrpc !== "2.0" || body.id !== 1 || !("result" in body)) throw new Error();
    return body.result;
  }
  try {
    // Fail closed on a wrong network before any read or broadcast. No cached
    // chain assertion can outlive a changed endpoint or mask an upstream error.
    const actual = await send({ method: "eth_chainId", params: [] });
    if (
      typeof actual !== "string" ||
      !/^0x[0-9a-f]+$/i.test(actual) ||
      BigInt(actual) !== BigInt(chainId)
    )
      throw new Error();
    return request.method === "eth_chainId" ? actual : await send(request);
  } catch (e) {
    if (e instanceof Error && e.message === "Alchemy RPC request rejected") throw e;
    throw new Error(RPC_UNAVAILABLE);
  }
}

export async function handleRpcProxy(request: Request, call = alchemyRequest) {
  const chainId = Number(new URL(request.url).searchParams.get("chainId"));
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reply({ error: "POST required" }, 405);
  if (chainId !== MONAD_TESTNET_CHAIN_ID)
    return reply(
      { error: chainId === 143 ? "Monad mainnet RPC is disabled" : "Unsupported chain" },
      400,
    );
  let id: string | number | null = null;
  let body;
  try {
    const text = await request.text();
    if (text.length > 24000) return reply({ error: "Request too large" }, 413);
    body = JSON.parse(text);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      body.jsonrpc !== "2.0" ||
      !["string", "number"].includes(typeof body.id) ||
      typeof body.method !== "string" ||
      (body.params !== undefined && !Array.isArray(body.params))
    )
      return reply({ error: "Invalid JSON-RPC request" }, 400);
    id = body.id;
    if (!READ_METHODS.has(body.method))
      return reply({ error: "Read-only RPC method required" }, 400);
    if (body.method === "eth_getLogs") {
      const filter = body.params?.[0];
      if (
        !filter?.address ||
        !/^0x[0-9a-f]+$/i.test(filter.fromBlock) ||
        !/^0x[0-9a-f]+$/i.test(filter.toBlock) ||
        BigInt(filter.toBlock) < BigInt(filter.fromBlock) ||
        BigInt(filter.toBlock) - BigInt(filter.fromBlock) > 2000n
      )
        return reply({ error: "Bounded log range required" }, 400);
    }
  } catch {
    return reply({ error: "Invalid JSON-RPC request" }, 400);
  }
  try {
    return reply({
      jsonrpc: "2.0",
      id,
      result: await call(chainId, { method: body.method, params: body.params }),
    });
  } catch (error) {
    const config = error instanceof RpcConfigurationError;
    return reply(
      {
        jsonrpc: "2.0",
        id,
        error: {
          code: config ? error.code : -32603,
          message: config ? error.message : RPC_UNAVAILABLE,
        },
      },
      503,
    );
  }
}
