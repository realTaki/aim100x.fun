/** Strip a trailing slash except for the hub root. */
export function normalizeAppPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

const HUB_TAB_PATHS = new Set(["/", "/subscribed", "/me/manager", "/me"]);

export function isHubTabPath(pathname: string): boolean {
  return HUB_TAB_PATHS.has(normalizeAppPath(pathname));
}

/** Plaza and broker hub paint their own logo row; the shell header would duplicate it. */
export function pageOwnsHubHeader(pathname: string): boolean {
  const path = normalizeAppPath(pathname);
  return path === "/" || path === "/me/manager";
}

/** Broker idol homepage editor or its advanced page — full-bleed, no tab capsule. */
export function isManagerIdolEditorPath(pathname: string): boolean {
  return /^\/me\/manager\/[^/]+(?:\/advanced)?$/.test(normalizeAppPath(pathname));
}

/** Pin the app shell to the visual window so content scrolls inside, not the document. */
export function shouldLockAppViewport(pathname: string): boolean {
  return isHubTabPath(pathname) || isManagerIdolEditorPath(pathname);
}

/** Canonical desktop phone-strip aspect: 19.5:9 (height:width). */
export const HUB_STRIP_WIDTH = 9;
export const HUB_STRIP_HEIGHT = 19.5;
export const HUB_STRIP_ASPECT = HUB_STRIP_WIDTH / HUB_STRIP_HEIGHT;

/** Large viewports still get the strip when the pointer is coarse (touch desktops). */
export const HUB_DESKTOP_MIN_WIDTH = 700;
export const HUB_DESKTOP_MIN_HEIGHT = 500;

/** Mouse/trackpad primary — same query as `.lf-frame` desktop sizing in styles.css. */
export const HUB_DESKTOP_POINTER_MQ = "(hover: hover) and (pointer: fine)";
export const HUB_DESKTOP_SIZE_MQ = `(min-width: ${HUB_DESKTOP_MIN_WIDTH}px) and (min-height: ${HUB_DESKTOP_MIN_HEIGHT}px)`;
export const HUB_DESKTOP_MQ = `${HUB_DESKTOP_POINTER_MQ}, ${HUB_DESKTOP_SIZE_MQ}`;

export const HUB_STRIP_STYLE = {
  "--lf-strip-w": String(HUB_STRIP_WIDTH),
  "--lf-strip-h": String(HUB_STRIP_HEIGHT),
} as const;

export type HubViewportMode = "phone" | "desktop";

export type HubViewportInput = {
  viewportWidth: number;
  viewportHeight: number;
  /** True when `HUB_DESKTOP_POINTER_MQ` matches. */
  desktopPointer: boolean;
};

export function hubStripWidthForHeight(height: number): number {
  return (height * HUB_STRIP_WIDTH) / HUB_STRIP_HEIGHT;
}

export function isHubDesktopViewport(input: HubViewportInput): boolean {
  if (input.desktopPointer) return true;
  return (
    input.viewportWidth >= HUB_DESKTOP_MIN_WIDTH &&
    input.viewportHeight >= HUB_DESKTOP_MIN_HEIGHT
  );
}

export function hubViewportMode(input: HubViewportInput): HubViewportMode {
  return isHubDesktopViewport(input) ? "desktop" : "phone";
}

/**
 * Phone: fill the screen (native aspect).
 * Desktop: height is the constraint; width = height × (9 / 19.5).
 * If that width would overflow, use the viewport width (taller strip, no letterbox).
 */
export function measureHubFrame(input: HubViewportInput): {
  width: number;
  height: number;
  mode: HubViewportMode;
} {
  const { viewportWidth, viewportHeight } = input;
  const mode = hubViewportMode(input);
  if (mode === "phone") {
    return { width: viewportWidth, height: viewportHeight, mode };
  }
  return {
    width: Math.min(viewportWidth, hubStripWidthForHeight(viewportHeight)),
    height: viewportHeight,
    mode,
  };
}
