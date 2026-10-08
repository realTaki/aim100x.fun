/** Copy Notion Images into R2/Neon, retaining UUIDs; never writes to Notion. */
import { randomUUID } from "node:crypto";
import { fetchMigrationSource } from "./notion-media-source.ts";
import { imageDigest } from "../src/lib/notion-images.ts";
import {
  MEDIA_COLLECTION_SCOPE,
  MEDIA_OBJECT_PREFIX,
  mediaSql,
  initializeMediaSchema,
  putMediaObject,
  signedMediaUrl,
  deleteMediaObject,
} from "../src/lib/media-storage.server.ts";

async function download(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Source image download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Empty source image");
  return { bytes, mime: response.headers.get("content-type")?.split(";")[0] || "image/jpeg" };
}
async function verifyObject(key: string, digest: string) {
  const response = await fetch(await signedMediaUrl(key));
  if (!response.ok) throw new Error(`R2 verification failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (imageDigest(bytes) !== digest) throw new Error("R2 checksum mismatch");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const source = await fetchMigrationSource();
  console.log(
    JSON.stringify({
      sourcePages: source.pages.length,
      eligibleImages: source.images.length,
      skippedNonLibraryPages: source.skipped,
      mode: apply ? "apply" : "dry-run",
    }),
  );
  if (!apply) return;
  await initializeMediaSchema();
  const sql = mediaSql();
  let migrated = 0,
    verified = 0;
  const failures: { id: string; message: string }[] = [];
  for (const image of source.images) {
    const uploaded: string[] = [];
    try {
      const [existing] = await sql`SELECT image_key, thumbnail_key, image_sha256, thumbnail_sha256,
        source_last_edited, token_id, scene, tags, prompt, type, content_rating, archived_at
        FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${image.pageId}`;
      if (existing) {
        // Never overwrite application edits/archives when resuming a migration.
        await verifyObject(existing.image_key, existing.image_sha256);
        if (existing.thumbnail_key)
          await verifyObject(existing.thumbnail_key, existing.thumbnail_sha256);
        verified++;
        continue;
      }
      if (!image.imageUrl) throw new Error("Notion image is missing its file URL");
      const original = await download(image.imageUrl);
      const thumbnail = image.thumbnailUrl ? await download(image.thumbnailUrl) : undefined;
      const key = `${MEDIA_OBJECT_PREFIX}/${image.pageId}/${randomUUID()}`;
      const thumbKey = thumbnail ? `${MEDIA_OBJECT_PREFIX}/${image.pageId}/${randomUUID()}` : null;
      await putMediaObject(key, original.bytes, original.mime);
      uploaded.push(key);
      if (thumbnail && thumbKey) {
        await putMediaObject(thumbKey, thumbnail.bytes, thumbnail.mime);
        uploaded.push(thumbKey);
      }
      const digest = imageDigest(original.bytes);
      const thumbDigest = thumbnail ? imageDigest(thumbnail.bytes) : null;
      await verifyObject(key, digest);
      if (thumbKey && thumbDigest) await verifyObject(thumbKey, thumbDigest);
      const rows =
        await sql`INSERT INTO aim_idol_media (collection_scope, id, token_id, scene, tags, prompt, type, content_rating,
        image_key, thumbnail_key, mime, image_sha256, thumbnail_sha256, source_notion_id, source_last_edited, updated_at)
        VALUES (${MEDIA_COLLECTION_SCOPE}, ${image.pageId}, ${image.tokenId}, ${image.scene}, ${image.tags}, ${image.prompt}, ${image.type},
        ${image.contentRating}, ${key}, ${thumbKey}, ${original.mime}, ${digest}, ${thumbDigest},
        ${image.pageId}, ${image.lastEdited ?? null}, ${image.lastEdited ?? new Date().toISOString()})
        ON CONFLICT (collection_scope,id) DO NOTHING RETURNING id`;
      if (!rows.length) await Promise.all(uploaded.map(deleteMediaObject));
      else migrated++;
    } catch (error) {
      // A failed insert can have an ambiguous outcome; retain uploaded objects
      // for safe recovery, rather than deleting files possibly referenced by SQL.
      failures.push({
        id: image.pageId,
        message: error instanceof Error ? error.name : "UnknownError",
      });
    }
    if ((migrated + verified + failures.length) % 10 === 0)
      console.log(JSON.stringify({ migrated, verified, failed: failures.length }));
  }
  const [{ count }] =
    await sql`SELECT count(*)::int AS count FROM aim_idol_media WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND source_notion_id IS NOT NULL`;
  console.log(
    JSON.stringify({
      eligibleImages: source.images.length,
      migrated,
      verified,
      importedRows: count,
      failures,
    }),
  );
  if (failures.length || migrated + verified !== source.images.length)
    throw new Error("Migration incomplete; rerun after resolving failures");
}
main().catch((error) => {
  console.error("Media migration failed:", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
});
