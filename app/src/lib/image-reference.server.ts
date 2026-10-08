import { MEDIA_COLLECTION_SCOPE, mediaSql, readMediaObject } from "./media-storage.server.ts";

/** Prefer the author's portrait to keep identity stable across scene generations. */
export async function loadIdolImageReference(
  tokenId: number,
  sceneId: string,
): Promise<string | undefined> {
  const [row] = await mediaSql()`SELECT image_key, mime FROM aim_idol_media
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND token_id = ${tokenId} AND archived_at IS NULL
    ORDER BY CASE
      WHEN type = 'face' THEN 0
      WHEN type = 'cover' THEN 1
      WHEN scene = ${sceneId} THEN 2
      WHEN type <> 'generated' THEN 3
      ELSE 4
    END, updated_at DESC, id DESC LIMIT 1`;
  if (!row) return undefined;
  const bytes = await readMediaObject(row.image_key);
  if (!bytes.length || !/^image\/(jpeg|png|webp)$/.test(row.mime))
    throw new Error("Idol reference image is invalid");
  return `data:${row.mime};base64,${bytes.toString("base64")}`;
}
