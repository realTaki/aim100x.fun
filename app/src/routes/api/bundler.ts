import { createFileRoute } from "@tanstack/react-router";
import { PIMLICO_BUNDLER_URL } from "@/lib/auth/passkey-aa";

const ALLOWED = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
]);

export const Route = createFileRoute("/api/bundler")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: { method?: unknown };
        const text = await request.text();
        try {
          payload = JSON.parse(text) as { method?: unknown };
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (typeof payload.method !== "string" || !ALLOWED.has(payload.method)) {
          return new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }
        const res = await fetch(PIMLICO_BUNDLER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "lonelyfuns-bundler",
          },
          body: text,
        });
        const reply = await res.text();
        try {
          const body = JSON.parse(reply) as {
            error?: { message?: unknown; code?: unknown; data?: unknown };
          };
          if (body.error) {
            console.error("[bundler]", payload.method, body.error);
          }
        } catch {
          console.error("[bundler]", payload.method, res.status, reply.slice(0, 180));
        }
        return new Response(reply, {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
