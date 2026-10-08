import { idolBio, idolName, idolTwitter, idolWebsite } from "./idol-fields.ts";
import {
  formatSalePrice,
  formatUsdcPrice,
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
} from "./idol-pricing.ts";
import { idolPublicPath } from "./idol-links.ts";
import type { Idol } from "./idols.ts";
import { NFT_METADATA_BASE_URI } from "./idols100x.ts";
import { parseTokenIdParam } from "./token-id.ts";

export type Erc721Attribute = {
  trait_type: string;
  value: string | number;
};

export type Erc721TokenMetadata = {
  name: string;
  description: string;
  image: string;
  external_url: string;
  website: string;
  twitter: string;
  attributes: Erc721Attribute[];
};

export const NFT_METADATA_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Content-Type",
} as const;

export const NFT_METADATA_JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
  ...NFT_METADATA_CORS_HEADERS,
} as const;

/** Use the deployed collection’s metadata host for its media and idol links. */
export function nftMetadataPublicOrigin(): string {
  return new URL(NFT_METADATA_BASE_URI).origin;
}

/** Absolute `/api/media/...` — never a short-lived storage URL. */
export function absolutePublicMediaUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/api/media/")) {
        return `${nftMetadataPublicOrigin()}${parsed.pathname}`;
      }
    } catch {
      return "";
    }
    return "";
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (!path.startsWith("/api/media/")) return "";
  return `${nftMetadataPublicOrigin()}${path}`;
}

export function nftMetadataTokenUri(tokenId: number): string {
  return `${NFT_METADATA_BASE_URI}${tokenId}`;
}

export function parseMetadataTokenKey(raw: string): { tokenId?: number } {
  const tokenId = parseTokenIdParam(raw);
  return tokenId ? { tokenId } : {};
}

export function buildErc721TokenMetadata(idol: Idol): Erc721TokenMetadata {
  const name = idolName(idol);
  const description = idolBio(idol) || `${name} on aim100x.fun.`;
  const attributes: Erc721Attribute[] = [
    { trait_type: "Token ID", value: idol.tokenId },
    { trait_type: "Public", value: idol.isPublic ? "true" : "false" },
    { trait_type: "Fans", value: idol.subscriberCount },
    { trait_type: "Total received", value: formatUsdcPrice(idol.receiptsUsdc) },
    { trait_type: "Subscribe", value: formatUsdcPrice(idolSubscribePriceUsdc(idol)) },
    { trait_type: "Image unlock", value: formatUsdcPrice(idolImageUnlockPriceUsdc(idol)) },
    { trait_type: "Sale", value: formatSalePrice(idol.salePriceUsdc) },
  ];
  return {
    name,
    description,
    image: absolutePublicMediaUrl(idol.avatar),
    external_url: `${nftMetadataPublicOrigin()}${idolPublicPath(idol.tokenId)}`,
    website: idolWebsite(idol),
    twitter: idolTwitter(idol),
    attributes,
  };
}
