import { LONELYFUNS_VERCEL_ORIGIN } from "./auth/account-host.ts";
import { idolBio, idolName, idolPersonality, idolTwitter, idolWebsite } from "./idol-fields.ts";
import {
  formatSalePrice,
  formatUsdcPrice,
  idolImageUnlockPriceUsdc,
  idolSubscribePriceUsdc,
} from "./idol-pricing.ts";
import { idolPublicUrl } from "./idol-links.ts";
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

/** Stable public origin for tokenURI JSON + `/api/media` (not preview hosts). */
export function nftMetadataPublicOrigin(): string {
  return LONELYFUNS_VERCEL_ORIGIN;
}

/** Absolute `/api/media/...` — never a short-lived Notion file URL. */
export function absolutePublicMediaUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith("/api/media/")) {
        return `${LONELYFUNS_VERCEL_ORIGIN}${parsed.pathname}`;
      }
    } catch {
      return "";
    }
    return "";
  }
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  if (!path.startsWith("/api/media/")) return "";
  return `${LONELYFUNS_VERCEL_ORIGIN}${path}`;
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
  const description =
    idolBio(idol) ||
    idolPersonality(idol) ||
    `${name} on LonelyFuns.`;
  const attributes: Erc721Attribute[] = [
    { trait_type: "Token ID", value: idol.tokenId },
    { trait_type: "Public", value: idol.isPublic ? "true" : "false" },
    { trait_type: "Fans", value: idol.subscriberCount },
    { trait_type: "累计收账", value: formatUsdcPrice(idol.receiptsUsdc) },
    { trait_type: "Subscribe", value: formatUsdcPrice(idolSubscribePriceUsdc(idol)) },
    { trait_type: "Image unlock", value: formatUsdcPrice(idolImageUnlockPriceUsdc(idol)) },
    { trait_type: "Sale", value: formatSalePrice(idol.salePriceUsdc) },
  ];
  const personality = idolPersonality(idol);
  if (personality) {
    attributes.push({ trait_type: "人设", value: personality });
  }
  return {
    name,
    description,
    image: absolutePublicMediaUrl(idol.avatar),
    external_url: idolPublicUrl(idol.tokenId),
    website: idolWebsite(idol),
    twitter: idolTwitter(idol),
    attributes,
  };
}
