/** SFW/NSFW label stored on Notion Images rows (not on-chain). */
export type ImageContentRating = "SFW" | "NSFW";

export const NOTION_IMAGE_CONTENT_RATING_PROPERTY = "Content Rating";

export function isImageContentRating(value: string): value is ImageContentRating {
  return value === "SFW" || value === "NSFW";
}
