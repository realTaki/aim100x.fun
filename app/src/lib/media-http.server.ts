import { resolveMediaUrls } from "./media-library.ts";
import { sessionUserFromRequest } from "./auth/wallet-auth-http.server.ts";
import { verifyImageAccess } from "./chat-image-payment.server.ts";
import { normalizeMediaId } from "./media-app-id.ts";
import { NFT_METADATA_CORS_HEADERS } from "./nft-metadata.ts";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "Referrer-Policy": "no-referrer",
};
export async function handleMediaRequest(
  request: Request,
  id: string,
  deps = {
    resolve: resolveMediaUrls,
    session: sessionUserFromRequest,
    fetch,
  },
) {
  if (!id || id.length > 160)
    return new Response("Not found", { status: 404, headers: privateHeaders });
  const media = await deps.resolve(id);
  const url = new URL(request.url);
  if (media.chatPaywalled) {
    const user = await deps.session(request);
    const access =
      user?.walletAddress &&
      (await verifyImageAccess(
        url.searchParams.get("access"),
        user.walletAddress.toLowerCase(),
        user.walletAddress,
        normalizeMediaId(id),
      ));
    let manager = false;
    if (!access && user?.walletAddress && media.tokenId) {
      const { isWalletIdolManager } = await import("./idol-manager.server");
      manager = await isWalletIdolManager(user.walletAddress, media.tokenId);
    }
    if (!access && !manager)
      return new Response("Payment required", { status: 402, headers: privateHeaders });
  }
  const source =
    url.searchParams.get("size") === "thumb" ? (media.thumbnail ?? media.image) : media.image;
  if (!source) return new Response("Not found", { status: 404, headers: privateHeaders });
  const image = await deps.fetch(source);
  if (!image.ok) return new Response("Image unavailable", { status: 502, headers: privateHeaders });
  // The bucket is private. Never redirect a browser to R2 or expose signed URLs.
  return new Response(image.body, {
    headers: {
      ...(!media.chatPaywalled ? NFT_METADATA_CORS_HEADERS : {}),
      ...privateHeaders,
      "Content-Type": image.headers.get("content-type") ?? "image/jpeg",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
