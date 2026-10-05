import { createFileRoute } from "@tanstack/react-router";
import { handleWalletAuthRequest } from "@/lib/auth/wallet-auth-http.server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handleWalletAuthRequest(request),
      POST: ({ request }) => handleWalletAuthRequest(request),
    },
  },
});
