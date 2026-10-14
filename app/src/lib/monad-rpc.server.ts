/** Alchemy URLs stay on the server; errors never include the URL or API key. */
export function alchemyRpcUrl(chainId: number, env = process.env): string {
  const network = chainId === 143 ? "mainnet" : chainId === 10143 ? "testnet" : null;
  if (!network) throw new Error("Unsupported Monad chain");
  const name = chainId === 143 ? "ALCHEMY_MONAD_MAINNET_RPC_URL" : "ALCHEMY_MONAD_TESTNET_RPC_URL";
  const raw = env[name];
  if (!raw) throw new Error(`${name} is required`);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${name} is invalid`); }
  if (url.protocol !== "https:" || url.hostname !== `monad-${network}.g.alchemy.com` || !/^\/v2\/[A-Za-z0-9_-]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password || url.port)
    throw new Error(`${name} must be the Alchemy ${network} HTTPS endpoint`);
  return url.toString();
}
export type RpcRequest = { method: string; params?: readonly unknown[] };
export async function alchemyRequest(chainId: number, request: RpcRequest, fetcher = fetch) {
  const url = alchemyRpcUrl(chainId);
  try {
    const response = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...request }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    const body = await response.json();
    if (body.error) {
      // Preserve only standard revert bytes for contract decoding. Upstream messages
      // may contain credential-bearing URLs or signed transactions.
      const e = new Error("Alchemy RPC request rejected") as Error & { code: number; data?: string };
      e.code = Number.isInteger(body.error.code) ? body.error.code : -32603;
      if (typeof body.error.data === "string" && /^0x[a-f0-9]{0,8192}$/i.test(body.error.data)) e.data = body.error.data;
      throw e;
    }
    if (!("result" in body)) throw new Error();
    if (request.method === "eth_chainId" && Number(BigInt(body.result)) !== chainId) throw new Error();
    return body.result;
  } catch (e) {
    if (e instanceof Error && e.message === "Alchemy RPC request rejected") throw e;
    throw new Error("Alchemy RPC unavailable or chain mismatch");
  }
}
const READ_METHODS = new Set(["eth_chainId", "eth_blockNumber", "eth_call", "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_getBlockByNumber", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getLogs", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory"]);
export async function handleRpcProxy(request: Request, call = alchemyRequest) {
  const chainId = Number(new URL(request.url).searchParams.get("chainId"));
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (![143,10143].includes(chainId)) return reply({ error: "Unsupported chain" }, 400);
  let id: unknown = null;
  try {
    const text = await request.text();
    if (text.length > 24000) return reply({ error: "Request too large" }, 413);
    const body = JSON.parse(text);
    id = body.id;
    if (!READ_METHODS.has(body.method) || (body.params && !Array.isArray(body.params))) return reply({ error: "Read-only RPC method required" }, 400);
    if (body.method === "eth_getLogs") {
      const filter = body.params?.[0];
      if (!filter?.address || !/^0x[0-9a-f]+$/i.test(filter.fromBlock) || !/^0x[0-9a-f]+$/i.test(filter.toBlock) || BigInt(filter.toBlock) - BigInt(filter.fromBlock) > 2000n) return reply({ error: "Bounded log range required" }, 400);
    }
    return reply({ jsonrpc: "2.0", id, result: await call(chainId, { method: body.method, params: body.params }) });
  } catch { return reply({ jsonrpc: "2.0", id, error: { code: -32603, message: "Alchemy RPC unavailable or not configured" } }, 503); }
}
