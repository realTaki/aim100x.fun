/** SFW/NSFW label stored on media rows (not on-chain). */
export type ImageContentRating = "SFW" | "NSFW";

export function isImageContentRating(value: string): value is ImageContentRating {
  return value === "SFW" || value === "NSFW";
}
