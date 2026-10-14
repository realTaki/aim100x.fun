import { createFileRoute } from "@tanstack/react-router";
import { handleRpcProxy } from "@/lib/monad-rpc.server";
export const Route = createFileRoute("/api/rpc")({
  server: { handlers: { POST: ({ request }) => handleRpcProxy(request) } },
});
