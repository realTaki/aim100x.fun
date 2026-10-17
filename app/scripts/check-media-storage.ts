/** Live, isolated media lifecycle check. Cleans up only its own fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { sessionSigningKey } from "../src/lib/auth/app-wallet.server.ts";
import {
  mintWalletSessionToken,
  SESSION_TOKEN_COOKIE,
} from "../src/lib/auth/wallet-auth.server.ts";
import {
  publishIdolImage,
  fetchMediaLibrary,
  replaceMediaImage,
  ensureAlbumThumbnail,
  clearMediaThumbnail,
  setMediaImageType,
  archiveMediaImages,
  resolveMediaUrls,
} from "../src/lib/media-library.ts";
import {
  requireAvailablePaymentImage,
  ImageUnavailableError,
} from "../src/lib/chat-image-availability.server.ts";
import {
  MEDIA_COLLECTION_SCOPE,
  mediaSql,
  deleteMediaObject,
  putMediaObject,
} from "../src/lib/media-storage.server.ts";
import { handleMediaRequest } from "../src/lib/media-http.server.ts";
const keys = new Set<string>();
let id: string | undefined;
const sql = mediaSql();
async function rememberKeys() {
  if (!id) return;
  const [row] =
    await sql`SELECT image_key, thumbnail_key FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  if (row?.image_key) keys.add(row.image_key);
  if (row?.thumbnail_key) keys.add(row.thumbnail_key);
}
try {
  const marker = `media-check-${randomUUID()}`;
  const result = await publishIdolImage({
    tokenId: 1,
    sceneId: marker,
    fileSuffix: marker,
    prompt: marker,
    tags: "test",
    contentRating: "SFW",
    bytes: Buffer.from("original-test-image"),
    thumbBytes: Buffer.from("thumb-test-image"),
    mime: "image/jpeg",
    type: "generated",
  });
  assert.ok(result);
  id = result.mediaId;
  await rememberKeys();
  const [row] = (await fetchMediaLibrary(1)).filter((row) => row.mediaId === id);
  assert.equal(row.prompt, marker);
  assert.equal(row.hasThumbnail, true);
  assert.equal(row.imageUrl, undefined);
  assert.equal(row.thumbnailUrl, undefined);
  const request = (query = "") => new Request(`https://aim100x.fun/api/media/${id}${query}`);
  let response = await handleMediaRequest(request(), id);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "original-test-image");
  assert.equal(response.headers.get("location"), null);
  response = await handleMediaRequest(request("?size=thumb"), id);
  assert.equal(await response.text(), "thumb-test-image");
  assert.equal(
    await replaceMediaImage({
      mediaId: id.replace(/-/g, ""),
      bytes: Buffer.from("replaced-image"),
      mime: "image/webp",
      filename: "ignored.webp",
    }),
    true,
  );
  await rememberKeys();
  response = await handleMediaRequest(request(), id);
  assert.equal(await response.text(), "replaced-image");
  assert.equal(response.headers.get("content-type"), "image/webp");
  await clearMediaThumbnail(id);
  await ensureAlbumThumbnail({ tokenId: 1, mediaId: id, bytes: Buffer.from("replacement-thumb") });
  await rememberKeys();
  await setMediaImageType(id, "photo");
  await sql`UPDATE aim_idol_media SET content_rating = 'NSFW' WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  assert.equal((await resolveMediaUrls(id)).chatPaywalled, true);
  assert.equal((await handleMediaRequest(request("?size=thumb"), id)).status, 402);
  // Exercise the real cookie and media-ticket verification on this isolated fixture.
  // No wallet signing, chain transaction, account row or real payment is involved.
  const viewer = "0x1111111111111111111111111111111111111111";
  const session = await mintWalletSessionToken(viewer);
  const access = await new SignJWT({ imageId: id.replace(/-/g, ""), wallet: viewer })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("aim100x.fun/chat-image/v1")
    .setAudience("media")
    .setSubject(viewer)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(sessionSigningKey());
  const authorizedRequest = (query = "") =>
    new Request(`https://aim100x.fun/api/media/${id}?access=${access}${query}`, {
      headers: { Cookie: `${SESSION_TOKEN_COOKIE}=${session}` },
    });
  response = await handleMediaRequest(authorizedRequest(), id);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "replaced-image");
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  response = await handleMediaRequest(authorizedRequest("&size=thumb"), id);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "replacement-thumb");
  assert.equal((await handleMediaRequest(request(`?access=${access}`), id)).status, 402);
  assert.equal(
    (
      await handleMediaRequest(
        new Request(`https://aim100x.fun/api/media/${id}?access=${access}`, {
          headers: { Cookie: `${SESSION_TOKEN_COOKIE}=invalid` },
        }),
        id,
      )
    ).status,
    402,
  );
  await requireAvailablePaymentImage(id, 1);
  await assert.rejects(requireAvailablePaymentImage(id, 2), ImageUnavailableError);
  const [original] =
    await sql`SELECT image_key FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  await deleteMediaObject(original.image_key);
  await assert.rejects(requireAvailablePaymentImage(id, 1), ImageUnavailableError);
  await putMediaObject(original.image_key, Buffer.from("replaced-image"), "image/webp");
  await requireAvailablePaymentImage(id, 1);
  assert.equal(await archiveMediaImages([id]), 1);
  await assert.rejects(requireAvailablePaymentImage(id, 1), ImageUnavailableError);
  assert.deepEqual(await resolveMediaUrls(id), {});
  console.log(
    "Live Neon/R2 upload, metadata, original/thumbnail streaming, replacement, authorization and payment-availability/archive checks passed.",
  );
} finally {
  await rememberKeys();
  if (id)
    await sql`DELETE FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  await Promise.all([...keys].map(deleteMediaObject));
}
