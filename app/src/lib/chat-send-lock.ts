import { threadGeneration, type ChatThread } from "@/lib/thread";

const inFlight = new Map<string, string>();
const liveThreads = new Map<string, ChatThread>();
const threadListeners = new Map<string, Set<(thread: ChatThread) => void>>();
const lockListeners = new Set<() => void>();

export function chatSessionKey(userId: string, tokenId: number) {
  return `${userId}:${tokenId}`;
}

function notifyLock() {
  for (const fn of lockListeners) fn();
}

/** One send per thread. Same-chip multi-taps (including after a remount) are dropped. */
export function beginChatSend(key: string, content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (inFlight.has(key)) return false;
  inFlight.set(key, text);
  notifyLock();
  return true;
}

export function endChatSend(key: string): void {
  if (!inFlight.has(key)) return;
  inFlight.delete(key);
  notifyLock();
}

export function getChatSendSnapshot(key: string): string {
  return inFlight.get(key) ?? "";
}

/** True while chip/text send has not finished. Used to skip dangling recovery. */
export function isChatSendInFlight(key: string): boolean {
  return inFlight.has(key);
}

export function subscribeChatSendLock(onStoreChange: () => void): () => void {
  lockListeners.add(onStoreChange);
  return () => {
    lockListeners.delete(onStoreChange);
  };
}

export function peekLiveThread(key: string): ChatThread | undefined {
  return liveThreads.get(key);
}

export function publishLiveThread(key: string, thread: ChatThread): void {
  const current = liveThreads.get(key);
  if (current && threadGeneration(current) > threadGeneration(thread)) return;
  liveThreads.set(key, thread);
  const subs = threadListeners.get(key);
  if (!subs) return;
  for (const fn of subs) fn(thread);
}

export function subscribeLiveThread(
  key: string,
  fn: (thread: ChatThread) => void,
): () => void {
  let subs = threadListeners.get(key);
  if (!subs) {
    subs = new Set();
    threadListeners.set(key, subs);
  }
  subs.add(fn);
  return () => {
    subs!.delete(fn);
    if (subs!.size === 0) threadListeners.delete(key);
  };
}

export function resetChatSendLockForTests(): void {
  inFlight.clear();
  liveThreads.clear();
  threadListeners.clear();
  lockListeners.clear();
}
