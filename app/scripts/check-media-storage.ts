/** Live, isolated media lifecycle check. Cleans up only its own fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  publishIdolImage,
  fetchNotionLibraryImages,
  replaceNotionPageImage,
  ensureAlbumThumbnail,
  clearNotionPageThumbnail,
  setNotionImageType,
  archiveNotionImagePages,
  resolveNotionMediaUrls,
} from "../src/lib/notion-images.ts";
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
  id = result.pageId;
  await rememberKeys();
  const [row] = (await fetchNotionLibraryImages(1)).filter((row) => row.pageId === id);
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
    await replaceNotionPageImage({
      pageId: id.replace(/-/g, ""),
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
  await clearNotionPageThumbnail(id);
  await ensureAlbumThumbnail({ tokenId: 1, pageId: id, bytes: Buffer.from("replacement-thumb") });
  await rememberKeys();
  await setNotionImageType(id, "photo");
  await sql`UPDATE aim_idol_media SET content_rating = 'NSFW' WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  assert.equal((await resolveNotionMediaUrls(id)).chatPaywalled, true);
  assert.equal((await handleMediaRequest(request("?size=thumb"), id)).status, 402);
  await requireAvailablePaymentImage(id, 1);
  await assert.rejects(requireAvailablePaymentImage(id, 2), ImageUnavailableError);
  const [original] =
    await sql`SELECT image_key FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id}`;
  await deleteMediaObject(original.image_key);
  await assert.rejects(requireAvailablePaymentImage(id, 1), ImageUnavailableError);
  await putMediaObject(original.image_key, Buffer.from("replaced-image"), "image/webp");
  await requireAvailablePaymentImage(id, 1);
  assert.equal(await archiveNotionImagePages([id]), 1);
  await assert.rejects(requireAvailablePaymentImage(id, 1), ImageUnavailableError);
  assert.deepEqual(await resolveNotionMediaUrls(id), {});
  console.log(
    "Live Neon/R2 upload, metadata, original/thumbnail streaming, replacement, authorization and payment-availability/archive checks passed.",
  );
} finally {
  await rememberKeys();
  if (id)
    await sql`DELETE FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${id} AND source_notion_id IS NULL`;
  await Promise.all([...keys].map(deleteMediaObject));
}
