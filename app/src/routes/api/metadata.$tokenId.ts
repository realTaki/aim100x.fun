import { createFileRoute } from "@tanstack/react-router";
import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import {
  buildErc721TokenMetadata,
  NFT_METADATA_CORS_HEADERS,
  NFT_METADATA_JSON_HEADERS,
  parseMetadataTokenKey,
} from "@/lib/nft-metadata";

function corsEmpty(status: number) {
  return new Response(null, { status, headers: NFT_METADATA_CORS_HEADERS });
}

function jsonBody(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: NFT_METADATA_JSON_HEADERS,
  });
}

async function metadataForParam(raw: string) {
  const key = decodeURIComponent(raw);
  const parsed = parseMetadataTokenKey(key);
  if (!parsed.tokenId) return jsonBody(404, { error: "not_found" });
  const idol = await loadIdolByTokenId(parsed.tokenId);
  if (!idol) return jsonBody(404, { error: "not_found" });
  return jsonBody(200, buildErc721TokenMetadata(idol));
}

export const Route = createFileRoute("/api/metadata/$tokenId")({
  server: {
    handlers: {
      OPTIONS: async () => corsEmpty(204),
      GET: async ({ params }) => metadataForParam(params.tokenId),
      HEAD: async ({ params }) => {
        const res = await metadataForParam(params.tokenId);
        return new Response(null, { status: res.status, headers: res.headers });
      },
    },
  },
});
