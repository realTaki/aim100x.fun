import { createFileRoute } from "@tanstack/react-router";
import { coverAlbumItemsFromLibrary } from "@/lib/cover-album";
import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import { fetchNotionLibraryImages } from "@/lib/notion-images";
import { NFT_METADATA_CORS_HEADERS } from "@/lib/nft-metadata";
import { parseTokenIdParam } from "@/lib/token-id";

export const Route = createFileRoute("/api/media/covers/$tokenId")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: NFT_METADATA_CORS_HEADERS }),
      GET: async ({ params }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) {
          return new Response(JSON.stringify({ error: "Unknown idol" }), {
            status: 404,
            headers: { "Content-Type": "application/json", ...NFT_METADATA_CORS_HEADERS },
          });
        }
        const images = await fetchNotionLibraryImages(idol.tokenId);
        return new Response(JSON.stringify({ items: coverAlbumItemsFromLibrary(images, idol.tokenId) }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...NFT_METADATA_CORS_HEADERS },
        });
      },
    },
  },
});
