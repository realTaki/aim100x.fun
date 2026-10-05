import { createFileRoute } from "@tanstack/react-router";
import { NFT_METADATA_CORS_HEADERS } from "@/lib/nft-metadata";
import { resolveMediaSource } from "@/lib/library";

export const Route = createFileRoute("/api/media/$id")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: NFT_METADATA_CORS_HEADERS }),
      GET: async ({ params, request }) => {
        const id = decodeURIComponent(params.id);
        if (!id || id.length > 160) {
          return new Response("Not found", {
            status: 404,
            headers: NFT_METADATA_CORS_HEADERS,
          });
        }
        const size = new URL(request.url).searchParams.get("size") ?? undefined;
        const resolved = await resolveMediaSource(id, size);
        if (resolved?.kind === "redirect") {
          return new Response(null, {
            status: 302,
            headers: {
              location: resolved.url,
              ...NFT_METADATA_CORS_HEADERS,
            },
          });
        }
        return new Response("Not found", {
          status: 404,
          headers: NFT_METADATA_CORS_HEADERS,
        });
      },
    },
  },
});
