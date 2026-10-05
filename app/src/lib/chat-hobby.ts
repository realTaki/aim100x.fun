/**
 * Abort the browser fetch before Vercel Hobby's 60s maxDuration kill so we can
 * persist a JSON error instead of a 504 HTML remount.
 */
import { chatSendClientTimeoutMs } from "@/lib/chat-timeout";

export { chatSendClientTimeoutMs as CHAT_SEND_CLIENT_TIMEOUT_MS };

export class ChatSendFailedError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ChatSendFailedError";
    this.status = status;
  }
}

function composeAbort(signals: AbortSignal[]): AbortSignal {
  const live = signals.filter(Boolean);
  if (live.length === 1) return live[0]!;
  if (typeof AbortSignal.any === "function") return AbortSignal.any(live);
  const ac = new AbortController();
  for (const s of live) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

/** 504/HTML/redirect from a killed Hobby function — not a login 401. */
export function isHobbySendFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string; status?: number };
  if (e.status === 401 || e.message === "Unauthorized") return false;
  if (typeof e.message === "string" && e.message.startsWith("Unauthorized")) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError" || e.name === "ChatSendFailedError") {
    return true;
  }
  if (e.status === 504 || e.status === 502 || e.status === 500) return true;
  const msg = e.message ?? "";
  return /timeout|504|502|FUNCTION_INVOCATION|Failed to fetch|Server function info not found|invariant|hobby-budget/i.test(
    msg,
  );
}

/**
 * Fetch `/_serverFn` without following a 504/login HTML document (that remounts
 * the SPA) and without using a cached body. Throws Unauthorized on 401 only.
 */
export async function hobbyServerFnFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const timeout = AbortSignal.timeout(chatSendClientTimeoutMs());
  const signal = init?.signal ? composeAbort([init.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      signal,
      cache: "no-store",
      redirect: "manual",
      credentials: "same-origin",
    });
  } catch (err) {
    if (err && typeof err === "object" && (err as { name?: string }).name === "AbortError") {
      throw new ChatSendFailedError("FUNCTION_INVOCATION_TIMEOUT", 504);
    }
    throw err;
  }

  if (res.status === 401) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }

  const redirected =
    res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
  if (redirected) {
    const loc = (res.headers.get("location") ?? "").toLowerCase();
    if (loc.includes("login")) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    throw new ChatSendFailedError("FUNCTION_INVOCATION_TIMEOUT", res.status);
  }

  if (res.status === 504 || res.status === 502 || res.status >= 500) {
    throw new ChatSendFailedError("FUNCTION_INVOCATION_TIMEOUT", res.status);
  }

  return res;
}
