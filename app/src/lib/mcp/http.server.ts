import { createMcpHandler } from "@modelcontextprotocol/server";
import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
} from "@/lib/mcp/auth.server";
import { createLonelyFunsMcpServer } from "@/lib/mcp/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, X-LonelyFuns-Agent-Key",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

const mcpHandler = createMcpHandler(
  async (ctx) => {
    const request = ctx.requestInfo;
    if (!request) throw new Error("MCP request missing");
    const auth = await authenticateMcpRequest(request);
    if (!auth.ok) throw new Error("unauthorized");
    return createLonelyFunsMcpServer(auth.session);
  },
  {
    legacy: "stateless",
    responseMode: "json",
    onerror: (error) => {
      if (error.message === "unauthorized") return;
      console.error("[mcp]", error.message);
    },
  },
);

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleMcpHttpRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  const auth = await authenticateMcpRequest(request);
  if (!auth.ok) return withCors(mcpUnauthorizedResponse());
  try {
    return withCors(await mcpHandler.fetch(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP failed";
    if (message !== "unauthorized") console.error("[mcp]", message);
    return withCors(
      new Response(JSON.stringify({ error: "mcp_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }
}
