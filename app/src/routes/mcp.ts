import { createFileRoute } from "@tanstack/react-router";
import { handleMcpHttpRequest } from "@/lib/mcp/http.server";

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => handleMcpHttpRequest(request),
      GET: ({ request }) => handleMcpHttpRequest(request),
      POST: ({ request }) => handleMcpHttpRequest(request),
      DELETE: ({ request }) => handleMcpHttpRequest(request),
    },
  },
});
