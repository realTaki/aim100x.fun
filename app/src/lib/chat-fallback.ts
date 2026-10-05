import type { ChatMsg, ChatThread } from "@/lib/thread";
import { uid } from "@/lib/utils";

/** In-thread send failure — screenshotable, not an idol line. */
export const CHAT_SEND_ERROR_COPY = "Couldn't send. Network issue — try again.";

export function withSendErrorBubble(
  thread: ChatThread,
  copy: string = CHAT_SEND_ERROR_COPY,
  nextId: () => string = uid,
): ChatThread {
  const chapter = thread.chapter;
  const errorMessage: ChatMsg = {
    id: nextId(),
    role: "assistant",
    content: copy,
    chapter,
    error: true,
  };
  return {
    ...thread,
    choicesByChapter: { ...thread.choicesByChapter, [chapter]: [] },
    messages: [...thread.messages, errorMessage],
  };
}

/**
 * After a Hobby `/_serverFn` kill remounts the SPA, OPFS still has the
 * optimistic user line and nothing after it. Turn that dangling send into
 * the in-thread error bubble instead of staying silent.
 */
export function withDanglingSendError(
  thread: ChatThread,
  copy: string = CHAT_SEND_ERROR_COPY,
  nextId: () => string = uid,
): ChatThread {
  const last = [...thread.messages]
    .reverse()
    .find((m) => m.role !== "meta" && !m.imagePending);
  if (!last || last.role !== "user" || last.error) return thread;
  return withSendErrorBubble(thread, copy, nextId);
}

/**
 * Same recovery, but never invent `CHAT_SEND_ERROR_COPY` while this tab still
 * has a chip/text send in flight (optimistic user line is not a killed send).
 */
export function recoverDanglingSend(
  thread: ChatThread,
  inFlight: boolean,
  copy: string = CHAT_SEND_ERROR_COPY,
  nextId: () => string = uid,
): ChatThread {
  if (inFlight) return thread;
  return withDanglingSendError(thread, copy, nextId);
}

export function markAssistantAsSendError(
  thread: ChatThread,
  copy: string = CHAT_SEND_ERROR_COPY,
): ChatThread {
  const messages = [...thread.messages];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "assistant" && !msg.imageUrl && !msg.imagePending) {
      messages[i] = { ...msg, content: copy, error: true };
      break;
    }
  }
  return { ...thread, messages };
}
