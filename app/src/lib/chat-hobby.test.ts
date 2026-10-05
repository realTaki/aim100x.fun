import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ChatSendFailedError,
  hobbyServerFnFetch,
  isHobbySendFailure,
} from "@/lib/chat-hobby";
import { chatSendClientTimeoutMs, chatTurnBudgetMs, HOBBY_SEND_CLIENT_MS, HOBBY_TURN_MS } from "@/lib/chat-timeout";
import { isUnauthorized } from "@/lib/utils";
import { CHAT_SEND_ERROR_COPY } from "@/lib/chat-fallback";

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("hobby send timeout", () => {
  it("aborts the client send before Vercel Hobby's 60s maxDuration", () => {
    assert.equal(chatSendClientTimeoutMs("lonelyfuns.vercel.app"), HOBBY_SEND_CLIENT_MS);
    assert.equal(chatSendClientTimeoutMs("lonelyfuns.vercel.app") < 60_000, true);
    assert.equal(chatSendClientTimeoutMs("lonelyfuns.vercel.app") > 10_000, true);
    assert.equal(chatTurnBudgetMs("lonelyfuns.vercel.app"), HOBBY_TURN_MS);
  });

  it("sets Nitro vercel maxDuration to 60 and does not use vercel.json functions globs", () => {
    const vite = readFileSync(join(APP_ROOT, "vite.config.ts"), "utf8");
    assert.match(vite, /functions:\s*\{\s*maxDuration:\s*60\s*\}/);
    const vercel = JSON.parse(readFileSync(join(APP_ROOT, "vercel.json"), "utf8")) as {
      functions?: unknown;
    };
    assert.equal(vercel.functions, undefined);
  });

  it("treats 504 / abort / missing server-fn as a chat failure, not login", () => {
    assert.equal(isHobbySendFailure(new ChatSendFailedError("FUNCTION_INVOCATION_TIMEOUT", 504)), true);
    assert.equal(isHobbySendFailure({ name: "TimeoutError", message: "The operation was aborted due to timeout" }), true);
    assert.equal(isHobbySendFailure({ message: "Server function info not found for abc" }), true);
    assert.equal(isHobbySendFailure({ message: "Failed to fetch" }), true);
    assert.equal(isHobbySendFailure({ message: "Unauthorized", status: 401 }), false);
    assert.equal(isUnauthorized({ message: "Unauthorized", status: 401 }), true);
    assert.equal(isUnauthorized(new ChatSendFailedError("FUNCTION_INVOCATION_TIMEOUT", 504)), false);
    assert.notEqual(CHAT_SEND_ERROR_COPY, "Unauthorized");
  });

  it("does not follow a 504/login document that would remount the SPA", async () => {
    const orig = globalThis.fetch;
    const calls: RequestInit[] = [];
    globalThis.fetch = (async (_url, init) => {
      calls.push(init as RequestInit);
      return new Response("FUNCTION_INVOCATION_TIMEOUT", {
        status: 504,
        headers: { "content-type": "text/html" },
      });
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => hobbyServerFnFetch("https://lonelyfuns.vercel.app/_serverFn/sendChat", { method: "POST" }),
        (err: unknown) => {
          assert.equal(isUnauthorized(err), false);
          assert.equal(isHobbySendFailure(err), true);
          return true;
        },
      );
      assert.equal(calls[0]?.cache, "no-store");
      assert.equal(calls[0]?.redirect, "manual");
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("keeps Unauthorized as login, not a network bubble", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("Unauthorized", { status: 401, headers: { "content-type": "text/plain" } })) as typeof fetch;
    try {
      await assert.rejects(() => hobbyServerFnFetch("https://lonelyfuns.vercel.app/_serverFn/sendChat"), (err: unknown) => {
        assert.equal(isUnauthorized(err), true);
        assert.equal(isHobbySendFailure(err), false);
        return true;
      });
    } finally {
      globalThis.fetch = orig;
    }
  });
});
