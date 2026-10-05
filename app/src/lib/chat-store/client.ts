import type { ChatMsg, ChatThread } from "@/lib/thread";
import type {
  ChatStoreRequest,
  ChatStoreResponse,
  ChatThreadMetaPatch,
} from "@/lib/chat-store/types";
import {
  adoptThreadGeneration,
  isStaleThreadGeneration,
} from "@/lib/chat-store/generation";

let worker: Worker | null = null;
let nextId = 1;
let initDone = false;
let initPromise: Promise<void> | null = null;

function resetWorkerState() {
  worker?.terminate();
  worker = null;
  initDone = false;
  initPromise = null;
}

let opChain: Promise<void> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    resetWorkerState();
  });
}

function getWorker(): Worker {
  if (typeof Worker === "undefined") {
    throw new Error("Chat store requires a browser Worker");
  }
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

function callWorker<T extends ChatStoreResponse>(req: ChatStoreRequest): Promise<T> {
  return enqueueOp(() => callWorkerNow<T>(req));
}

function callWorkerNow<T extends ChatStoreResponse>(req: ChatStoreRequest): Promise<T> {
  const id = nextId++;
  const full = { ...req, id };
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const cleanup = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      w.removeEventListener("messageerror", onMessageError);
    };
    const onMessage = (ev: MessageEvent<ChatStoreResponse>) => {
      if (ev.data.id !== id) return;
      cleanup();
      if (ev.data.ok) resolve(ev.data as T);
      else reject(new Error(ev.data.error));
    };
    const onError = (ev: ErrorEvent) => {
      cleanup();
      resetWorkerState();
      reject(new Error(ev.message || "Chat store worker failed"));
    };
    const onMessageError = () => {
      cleanup();
      resetWorkerState();
      reject(new Error("Chat store worker message error"));
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    w.addEventListener("messageerror", onMessageError);
    w.postMessage(full);
  });
}

/** Lazy-init OPFS sqlite; safe to call from chat or history routes only. */
export async function ensureChatStore(): Promise<void> {
  if (initDone) return;
  if (!initPromise) {
    initPromise = callWorker({ id: 0, type: "init" })
      .then(() => {
        initDone = true;
      })
      .catch((err) => {
        resetWorkerState();
        throw err;
      });
  }
  await initPromise;
}

export async function loadLocalThread(userId: string, tokenKey: string): Promise<ChatThread | null> {
  try {
    await ensureChatStore();
    const res = await callWorker<{ id: number; ok: true; thread?: ChatThread | null }>({
      id: 0,
      type: "getThread",
      userId,
      tokenKey,
    });
    const thread = res.thread ?? null;
    if (thread) adoptThreadGeneration(userId, tokenKey, thread.generation);
    return thread;
  } catch {
    /* Empty / missing OPFS is an empty thread, not a load failure. */
    return null;
  }
}

export async function saveLocalThread(userId: string, tokenKey: string, thread: ChatThread) {
  try {
    if (isStaleThreadGeneration(userId, tokenKey, thread.generation)) return;
    await ensureChatStore();
    if (isStaleThreadGeneration(userId, tokenKey, thread.generation)) return;
    await callWorker({ id: 0, type: "setThread", userId, tokenKey, thread });
    adoptThreadGeneration(userId, tokenKey, thread.generation);
  } catch {
    /* First chat can stay in-memory if OPFS is empty or unavailable. */
  }
}

export async function appendLocalMessages(
  userId: string,
  tokenKey: string,
  messages: ChatMsg[],
  meta: ChatThreadMetaPatch,
) {
  try {
    if (isStaleThreadGeneration(userId, tokenKey, meta.generation)) return;
    await ensureChatStore();
    if (isStaleThreadGeneration(userId, tokenKey, meta.generation)) return;
    await callWorker({ id: 0, type: "appendMessages", userId, tokenKey, messages, meta });
  } catch {
    /* Keep the in-memory thread if persist fails. */
  }
}

export async function searchLocalMessages(
  userId: string,
  tokenKey: string,
  query: string,
): Promise<string[]> {
  try {
    await ensureChatStore();
    const res = await callWorker<{ id: number; ok: true; messageIds?: string[] }>({
      id: 0,
      type: "search",
      userId,
      tokenKey,
      query,
    });
    return res.messageIds ?? [];
  } catch {
    return [];
  }
}
