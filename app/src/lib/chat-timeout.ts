/** Vercel Hobby function maxDuration is 60s; leave headroom to return JSON. */
export const HOBBY_SEND_CLIENT_MS = 55_000;
export const HOBBY_TURN_MS = 50_000;
export const HOBBY_COMPLETION_MS = 45_000;

export function chatHostFromLocation(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.location.hostname;
  } catch {
    return "";
  }
}

export function chatSendClientTimeoutMs(_host = chatHostFromLocation()): number {
  return HOBBY_SEND_CLIENT_MS;
}

export function chatTurnBudgetMs(_host: string): number {
  return HOBBY_TURN_MS;
}

export function chatCompletionTimeoutMs(_host: string): number {
  return HOBBY_COMPLETION_MS;
}
