export type ImageSlotKind = "avatar" | "banner" | "cover";

/** Canonical full-res pixels. Crop-on-upload locks ratio, then caps to these. */
export const AVATAR_SIZE = 1408;
export const BANNER_WIDTH = 1792;
export const BANNER_HEIGHT = 1008;
export const COVER_WIDTH = 1152;
export const COVER_HEIGHT = 1728;

/** Width / height. */
export const AVATAR_ASPECT = 1 / 1;
/** 横封面 strip (`h-28`); 16:9 source, object-cover in the slot. */
export const BANNER_ASPECT = BANNER_WIDTH / BANNER_HEIGHT;
/** 封面相册 + 候选池. */
export const COVER_POOL_ASPECT = COVER_WIDTH / COVER_HEIGHT;

/** JPEG from broker crop; ~2MP at q=0.9 can exceed 800 KB. */
export const PROFILE_UPLOAD_MAX_BYTES = 2_000_000;

export function aspectForSlot(kind: ImageSlotKind): number {
  if (kind === "avatar") return AVATAR_ASPECT;
  if (kind === "banner") return BANNER_ASPECT;
  return COVER_POOL_ASPECT;
}

export function longEdgeForSlot(kind: ImageSlotKind): number {
  if (kind === "avatar") return AVATAR_SIZE;
  if (kind === "banner") return BANNER_WIDTH;
  return COVER_HEIGHT;
}

export function pixelsForSlot(kind: ImageSlotKind = "cover"): {
  width: number;
  height: number;
} {
  if (kind === "avatar") return { width: AVATAR_SIZE, height: AVATAR_SIZE };
  if (kind === "banner") return { width: BANNER_WIDTH, height: BANNER_HEIGHT };
  return { width: COVER_WIDTH, height: COVER_HEIGHT };
}

export function slotAspectLabel(kind: ImageSlotKind = "cover"): "1:1" | "16:9" | "2:3" {
  if (kind === "avatar") return "1:1";
  if (kind === "banner") return "16:9";
  return "2:3";
}

/** Same-page `Thumbnail` on every Images write (avatar, banner, cover, pool, chat). */
export function slotWritesThumbnail(_kind?: ImageSlotKind): boolean {
  return true;
}

export function typeWritesThumbnail(_type?: string): boolean {
  return true;
}

export function cropRectForAspect(
  sourceW: number,
  sourceH: number,
  aspect: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceW <= 0 || sourceH <= 0 || aspect <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, sourceW), sh: Math.max(1, sourceH) };
  }
  const srcAspect = sourceW / sourceH;
  if (srcAspect > aspect) {
    const sw = sourceH * aspect;
    return { sx: (sourceW - sw) / 2, sy: 0, sw, sh: sourceH };
  }
  const sh = sourceW / aspect;
  return { sx: 0, sy: (sourceH - sh) / 2, sw: sourceW, sh };
}
