/**
 * Images DB property names. Canonical pixels: project store `docs/image-sizes.md`.
 * Cover-album and avatar thumbs are a **Thumbnail** file on the same page as **Image**.
 * `/api/media` resolves by Notion page id. Name is title-only, never a key.
 */
export const NOTION_IMAGE_TOKEN_ID_PROPERTY = "Token Id";
export const NOTION_IMAGE_SCENE_PROPERTY = "Scene";
export const NOTION_IMAGE_TYPE_PROPERTY = "Type";
export const NOTION_IMAGE_TAGS_PROPERTY = "Tags";
export const NOTION_IMAGE_THUMBNAIL_PROPERTY = "Thumbnail";
