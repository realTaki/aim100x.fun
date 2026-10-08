import { createFileRoute } from "@tanstack/react-router";
import { NFT_METADATA_CORS_HEADERS } from "@/lib/nft-metadata";
import { handleMediaRequest } from "@/lib/media-http.server";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: NFT_METADATA_CORS_HEADERS }),
      GET: async ({ params, request }) => handleMediaRequest(request, params.id),
    },
  },
});
