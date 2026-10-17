import { dashedMediaId, isMediaId } from "./media-app-id.ts";
import { MEDIA_COLLECTION_SCOPE, mediaSql, mediaObjectExists } from "./media-storage.server.ts";

export class ImageUnavailableError extends Error {
  constructor() {
    super("This photo is unavailable. No new payment was submitted.");
    this.name = "ImageUnavailableError";
  }
}

async function findImageKey(imageId: string, tokenId: number): Promise<string | undefined> {
  const [row] = await mediaSql()`SELECT image_key FROM aim_idol_media
    WHERE collection_scope = ${MEDIA_COLLECTION_SCOPE} AND id = ${dashedMediaId(imageId)} AND token_id = ${tokenId} AND archived_at IS NULL`;
  return row?.image_key;
}

/** Fresh checks: an old quote must not charge for archived or missing originals. */
export async function requireAvailablePaymentImage(
  imageId: string,
  tokenId: number,
  deps = { findImageKey, objectExists: mediaObjectExists },
): Promise<void> {
  try {
    if (!isMediaId(imageId)) throw new ImageUnavailableError();
    const key = await deps.findImageKey(imageId, tokenId);
    if (!key || !(await deps.objectExists(key))) throw new ImageUnavailableError();
  } catch {
    // Fail closed on database or storage outages as well as missing images.
    throw new ImageUnavailableError();
  }
}
