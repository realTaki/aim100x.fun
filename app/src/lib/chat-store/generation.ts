import { threadGeneration } from "@/lib/thread";

const accepted = new Map<string, number>();

function storeKey(userId: string, tokenKey: string) {
  return `${userId}\0${tokenKey}`;
}

/** Remember the newest history-reset generation for this OPFS thread. */
export function adoptThreadGeneration(
  userId: string,
  tokenKey: string,
  generation: number | undefined,
): void {
  const n = threadGeneration({ generation });
  const key = storeKey(userId, tokenKey);
  if (n > (accepted.get(key) ?? 0)) accepted.set(key, n);
}

export function isStaleThreadGeneration(
  userId: string,
  tokenKey: string,
  generation: number | undefined,
): boolean {
  return threadGeneration({ generation }) < (accepted.get(storeKey(userId, tokenKey)) ?? 0);
}

export function resetThreadGenerationForTests(): void {
  accepted.clear();
}
