import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { withTemporaryMiniMaxFallback } from "./minimax-fallback.server.ts";
import { UnpaidAiRequestError } from "./x402-payment.server.ts";
import {
  postChatCompletions,
  postAiRequest,
  imageGenerateRequest,
  decodeGeneratedImages,
} from "./ai-provider.ts";

const originalKey = process.env.MINIMAX_CN_API_KEY;
const originalSwitch = process.env.AIM_TEMP_MINIMAX_FALLBACK;
const originalFetch = globalThis.fetch;
afterEach(() => {
  if (originalKey === undefined) delete process.env.MINIMAX_CN_API_KEY;
  else process.env.MINIMAX_CN_API_KEY = originalKey;
  if (originalSwitch === undefined) delete process.env.AIM_TEMP_MINIMAX_FALLBACK;
  else process.env.AIM_TEMP_MINIMAX_FALLBACK = originalSwitch;
  globalThis.fetch = originalFetch;
});
const options = () => {
  process.env.MINIMAX_CN_API_KEY = "test-key";
  delete process.env.AIM_TEMP_MINIMAX_FALLBACK;
  return {
    purpose: "chat" as const,
    usable: (body: unknown) => Boolean((body as { choices?: unknown[] })?.choices?.length),
  };
};
const success = () => Response.json({ choices: [{ message: { content: "hello" } }] });

it("keeps a usable primary response without calling MiniMax", async () => {
  const opts = options();
  const response = success();
  assert.equal(
    await withTemporaryMiniMaxFallback(
      async () => response,
      async () => {
        throw Error("must not fallback");
      },
      opts,
    ),
    response,
  );
  assert.equal((await response.json()).choices[0].message.content, "hello");
});

it("falls back once to actual CN MiniMax M3 with tools and thinking disabled on an unpaid outage", async () => {
  const opts = options();
  let calls = 0;
  const tools = [
    { type: "function", function: { name: "send_photo", parameters: { type: "object" } } },
  ];
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.minimax.cn/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, "MiniMax-M3");
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.deepEqual(body.tools, tools);
    assert.equal("tool_choice" in body, false);
    return success();
  };
  const result = await withTemporaryMiniMaxFallback(
    async () => Response.json({ error: "route missing" }, { status: 404 }),
    (backend, signal) =>
      postChatCompletions(
        backend,
        { messages: [{ role: "user", content: "hi" }], tools, tool_choice: "auto" },
        { signal },
      ),
    opts,
  );
  assert.equal(result.status, 200);
  assert.equal(calls, 1);
});

it("uses image-01 with the same private character reference, dimensions and count", async () => {
  options();
  const image = {
    prompt: "portrait",
    contentRating: "SFW" as const,
    count: 1,
    referenceImage: "data:image/png;base64,reference",
  };
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.minimax.cn/v1/image_generation");
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, "image-01");
    assert.equal(body.n, 1);
    assert.equal(body.width, 1152);
    assert.equal(body.height, 1728);
    assert.deepEqual(body.subject_reference, [
      { type: "character", image_file: image.referenceImage },
    ]);
    return Response.json({ data: { image_base64: ["generated"] } });
  };
  const result = await withTemporaryMiniMaxFallback(
    async () => {
      throw new UnpaidAiRequestError(Error("connection failed"));
    },
    (backend, signal) => postAiRequest(backend, imageGenerateRequest(backend, image), { signal }),
    { purpose: "image", usable: (body) => decodeGeneratedImages(body).length > 0 },
  );
  assert.deepEqual(decodeGeneratedImages(await result.json()), [{ b64: "generated" }]);
  assert.equal(calls, 1);
});

it("does not fallback after settlement, even for provider errors or empty output", async () => {
  const opts = options();
  for (const status of [200, 500]) {
    const response = Response.json(
      { choices: [] },
      { status, headers: { "PAYMENT-RESPONSE": "settled" } },
    );
    assert.equal(
      await withTemporaryMiniMaxFallback(
        async () => response,
        async () => {
          throw Error("must not fallback");
        },
        opts,
      ),
      response,
    );
  }
});

it("does not mask login, validation, pending-run or ambiguous payment errors", async () => {
  const opts = options();
  for (const message of [
    "Wallet login required",
    "payment submitted; confirmation unavailable",
    "run pending; do not resubmit",
  ]) {
    const error = Error(message);
    await assert.rejects(
      withTemporaryMiniMaxFallback(
        async () => {
          throw error;
        },
        async () => {
          throw Error("must not fallback");
        },
        opts,
      ),
      (e) => e === error,
    );
  }
  for (const status of [400, 401, 403]) {
    const response = new Response("error", { status });
    assert.equal(
      await withTemporaryMiniMaxFallback(
        async () => response,
        async () => {
          throw Error("must not fallback");
        },
        opts,
      ),
      response,
    );
  }
});

it("handles malformed/empty unpaid output, but does not retry a failing fallback", async () => {
  const opts = options();
  for (const response of [success(), Response.json({ choices: [] }), new Response("not JSON")]) {
    let calls = 0;
    const result = await withTemporaryMiniMaxFallback(
      async () => response,
      async () => {
        calls++;
        return new Response("unavailable", { status: 503 });
      },
      opts,
    );
    assert.equal(calls, response === result ? 0 : 1);
    assert.equal(result.status, response === result ? 200 : 503);
  }
});

it("passes through untouched when disabled or the key is absent, and respects cancellation", async () => {
  const opts = options();
  for (const disabled of ["switch", "key"]) {
    if (disabled === "switch") process.env.AIM_TEMP_MINIMAX_FALLBACK = "false";
    else {
      delete process.env.AIM_TEMP_MINIMAX_FALLBACK;
      delete process.env.MINIMAX_CN_API_KEY;
    }
    const response = new Response("error", { status: 503 });
    assert.equal(
      await withTemporaryMiniMaxFallback(
        async () => response,
        async () => {
          throw Error("must not fallback");
        },
        opts,
      ),
      response,
    );
  }
  options();
  const aborted = new AbortController();
  aborted.abort(Error("cancelled"));
  await assert.rejects(
    withTemporaryMiniMaxFallback(
      async () => {
        throw new UnpaidAiRequestError(Error("offline"));
      },
      async () => {
        throw Error("must not fallback");
      },
      { ...opts, signal: aborted.signal },
    ),
    UnpaidAiRequestError,
  );
});
