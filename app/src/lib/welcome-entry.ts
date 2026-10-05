/** Session cookie: `/` sends first-time visitors to `/welcome`. */
export const WELCOME_PATH = "/welcome";
export const PLAZA_PATH = "/";
export const WELCOME_ENTERED_COOKIE = "msgs-welcome";
export const WELCOME_ENTERED_VALUE = "1";

export function cookieIndicatesWelcomeEntered(cookieHeader: string): boolean {
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (name === WELCOME_ENTERED_COOKIE && value === WELCOME_ENTERED_VALUE) {
      return true;
    }
  }
  return false;
}

export function hasWelcomeEntered(): boolean {
  if (typeof document === "undefined") return false;
  return cookieIndicatesWelcomeEntered(document.cookie);
}

export function markWelcomeEntered(): void {
  if (typeof document === "undefined") return;
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${WELCOME_ENTERED_COOKIE}=${WELCOME_ENTERED_VALUE}; Path=/; SameSite=Lax${secure}`;
}

export function shouldRedirectRootToWelcome(entered: boolean): boolean {
  return !entered;
}

/** Unique Type=cover URLs across idols. Banners and avatars stay out of the splash pool. */
export function welcomeCoverPool(
  idols: readonly { covers?: readonly string[] | null }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const idol of idols) {
    for (const raw of idol.covers ?? []) {
      const src = raw.trim();
      if (!src || seen.has(src)) continue;
      seen.add(src);
      out.push(src);
    }
  }
  return out;
}

/** One cover for this open. Caller must not persist the choice. */
export function pickWelcomeCover(
  covers: readonly string[],
  random: () => number = Math.random,
): string {
  if (covers.length === 0) return "";
  const index = Math.min(covers.length - 1, Math.max(0, Math.floor(random() * covers.length)));
  return covers[index] ?? "";
}

/** Distance the knob can travel (track inner width minus knob). */
export const SWIPE_UNLOCK_RATIO = 0.72;
export const SWIPE_FLICK_RATIO = 0.32;
export const SWIPE_FLICK_VELOCITY = 0.85;

export function swipeProgress(dx: number, travel: number): number {
  if (!(travel > 0)) return 0;
  return Math.min(1, Math.max(0, dx / travel));
}

export function swipeUnlocked(dx: number, travel: number, velocityPxPerMs = 0): boolean {
  const progress = swipeProgress(dx, travel);
  if (progress >= SWIPE_UNLOCK_RATIO) return true;
  return velocityPxPerMs >= SWIPE_FLICK_VELOCITY && progress >= SWIPE_FLICK_RATIO;
}

/** Client UX lock only — not account auth. */
export const WELCOME_PIN = "996996";
export const WELCOME_PIN_LENGTH = 6;
export const FACE_ID_FAIL_MS = 820;

export function appendPinDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return current;
  if (current.length >= WELCOME_PIN_LENGTH) return current;
  return `${current}${digit}`;
}

export function pinEntryStatus(pin: string): "incomplete" | "ok" | "wrong" {
  if (pin.length < WELCOME_PIN_LENGTH) return "incomplete";
  return pin === WELCOME_PIN ? "ok" : "wrong";
}
