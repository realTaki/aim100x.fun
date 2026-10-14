import { it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { postMonidApi } from "./monid-api.server.ts";
import {
  BLOCKRUN_CHAT_URL,
  MONAD_CHAT_MODEL,
  MONAD_KIMI_CHAT_MODEL,
  MONAD_MINIMAX_CHAT_MODEL,
  X402_CHAT_MODELS,
  monadChatPayload,
  monidRequest,
} from "./monad-ai.ts";
import { MONID_RUN_URL } from "./x402-payment.server.ts";
const owner = privateKeyToAccount(("0x" + "01".repeat(32)) as `0x${string}`);
const signal = () => AbortSignal.timeout(5000);
it("routes the msgs Grok model through the Monad Hub BlockRun envelope with tools intact", async () => {
  const tools = [{ type: "function", function: { name: "send_photo" } }];
  const body = monadChatPayload({
    model: "wrong",
    messages: [{ role: "user", content: "hi" }],
    tools,
    tool_choice: "auto",
    thinking: { type: "enabled" },
  });
  assert.equal(body.model, MONAD_CHAT_MODEL);
  assert.equal(body.reasoning_effort, "none");
  assert.equal(body.stream, false);
  assert.equal("thinking" in body, false);
  assert.equal(body.tools, tools);
  const result = await postMonidApi(owner, BLOCKRUN_CHAT_URL, body, signal(), {
    pay: async (payer, url, init) => {
      assert.equal(payer.address, owner.address);
      assert.equal(url, MONID_RUN_URL);
      assert.deepEqual(JSON.parse(init.body as string), {
        provider: "blockrun.ai",
        endpoint: "/api/v1/chat/completions",
        input: { body },
      });
      return Response.json({
        status: "COMPLETED",
        providerResponse: { httpStatus: 200 },
        output: { choices: [{ message: { content: "hello" } }] },
      });
    },
    retrieve: async () => {
      throw new Error("Unexpected poll");
    },
  });
  assert.equal((await result.json()).choices[0].message.content, "hello");
});
it("retains MiniMax M3 without silently substituting another model and confines media endpoints", () => {
  const body = monadChatPayload({}, MONAD_MINIMAX_CHAT_MODEL);
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.throws(() => monadChatPayload({}, "openai/gpt-oss-120b"), /Unsupported/);
  assert.equal(
    monidRequest("https://api.minimax.cn/v1/t2a_v2", { model: "speech-2.8-turbo" }).provider,
    "minimax",
  );
  assert.equal(
    monidRequest("https://api.minimax.cn/v1/image_generation", { model: "image-01" }).provider,
    "minimax",
  );
  assert.throws(() => monidRequest("https://api.minimax.cn/v1/voice_design", {}));
  assert.throws(() => monidRequest("https://evil.test/api.minimax.cn/v1/t2a_v2", {}));
});
it("routes Kimi K3 through the same BlockRun envelope without substituting Grok or MiniMax", async () => {
  const tools = [{ type: "function", function: { name: "send_photo" } }];
  const body = monadChatPayload(
    {
      model: "wrong",
      messages: [{ role: "user", content: "hi" }],
      tools,
      tool_choice: "auto",
      thinking: { type: "enabled" },
      reasoning_effort: "high",
    },
    MONAD_KIMI_CHAT_MODEL,
  );
  assert.deepEqual([...X402_CHAT_MODELS], [
    MONAD_CHAT_MODEL,
    MONAD_MINIMAX_CHAT_MODEL,
    MONAD_KIMI_CHAT_MODEL,
  ]);
  assert.equal(body.model, MONAD_KIMI_CHAT_MODEL);
  assert.equal(body.model, "moonshot/kimi-k3");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in body, false);
  assert.equal(body.stream, false);
  assert.equal(body.tools, tools);
  const result = await postMonidApi(owner, BLOCKRUN_CHAT_URL, body, signal(), {
    pay: async (payer, url, init) => {
      assert.equal(payer.address, owner.address);
      assert.equal(url, MONID_RUN_URL);
      assert.deepEqual(JSON.parse(init.body as string), {
        provider: "blockrun.ai",
        endpoint: "/api/v1/chat/completions",
        input: { body },
      });
      return Response.json({
        status: "COMPLETED",
        providerResponse: { httpStatus: 200 },
        output: { choices: [{ message: { content: "hello" } }] },
      });
    },
    retrieve: async () => {
      throw new Error("Unexpected poll");
    },
  });
  assert.equal((await result.json()).choices[0].message.content, "hello");
});
it("retrieves a pending run once with no additional payment and unwraps provider HTTP failures", async () => {
  let paid = 0,
    polled = 0;
  const result = await postMonidApi(owner, BLOCKRUN_CHAT_URL, {}, signal(), {
    pay: async () => {
      paid++;
      return Response.json(
        { runId: "run1", pollUrl: "https://x402.monid.ai/v1/runs/run1" },
        { status: 202 },
      );
    },
    retrieve: async (_payer, url) => {
      polled++;
      assert.equal(url, "https://x402.monid.ai/v1/runs/run1");
      return Response.json({
        status: "COMPLETED",
        providerResponse: { httpStatus: 429, body: { error: "upstream rate limit" } },
      });
    },
  });
  assert.equal(result.status, 429);
  assert.deepEqual(await result.json(), { error: "upstream rate limit" });
  assert.equal(paid, 1);
  assert.equal(polled, 1);
});
it("reports failed or missing-output runs without another paid submission", async () => {
  for (const envelope of [
    { runId: "x", status: "FAILED" },
    { runId: "x", status: "COMPLETED", providerResponse: { httpStatus: 200 } },
  ]) {
    let paid = 0;
    await assert.rejects(
      postMonidApi(owner, BLOCKRUN_CHAT_URL, {}, signal(), {
        pay: async () => {
          paid++;
          return Response.json(envelope);
        },
        retrieve: async () => {
          throw new Error("Unexpected poll");
        },
      }),
      /do not/,
    );
    assert.equal(paid, 1);
  }
});
it("preserves settlement evidence when the paid upstream provider fails", async () => {
  const result = await postMonidApi(owner, BLOCKRUN_CHAT_URL, {}, signal(), {
    pay: async () =>
      Response.json(
        {
          status: "COMPLETED",
          providerResponse: { httpStatus: 503, body: { error: "unavailable" } },
        },
        { headers: { "PAYMENT-RESPONSE": "receipt" } },
      ),
    retrieve: async () => {
      throw Error("unexpected poll");
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("PAYMENT-RESPONSE"), "receipt");
});
it("routes Grok Imagine 2.0 and optional MiniMax character-reference images through Monid", async () => {
  const { imageEditRequest, imageGenerateRequest, decodeGeneratedImages } =
    await import("./ai-provider.ts");
  const { BLOCKRUN_IMAGE_URL, MONAD_IMAGE_MODEL } = await import("./monad-ai.ts");
  const request = { prompt: "idol portrait", contentRating: "SFW" as const, count: 1 };
  assert.throws(
    () => imageEditRequest({ kind: "x402", apiKey: "" }, request, "data:image/jpeg;base64,AQ=="),
    /does not support reference/,
  );
  const image = imageGenerateRequest({ kind: "x402", apiKey: "" }, request);
  assert.equal(image.url, BLOCKRUN_IMAGE_URL);
  assert.equal(image.body.model, MONAD_IMAGE_MODEL);
  assert.equal(image.body.response_format, "b64_json");
  assert.equal("subject_reference" in image.body, false);
  const result = await postMonidApi(owner, image.url, image.body, signal(), {
    pay: async (_payer, url, init) => {
      assert.equal(url, MONID_RUN_URL);
      assert.deepEqual(JSON.parse(init.body as string), {
        provider: "blockrun.ai",
        endpoint: "/api/v1/images/generations",
        input: { body: image.body },
      });
      return Response.json({ status: "COMPLETED", output: { data: [{ b64_json: "aW1hZ2U=" }] } });
    },
    retrieve: async () => {
      throw new Error("Unexpected poll");
    },
  });
  assert.deepEqual(decodeGeneratedImages(await result.json()), [{ b64: "aW1hZ2U=" }]);
  const minimax = imageEditRequest(
    { kind: "x402", apiKey: "", imageModel: "image-01" },
    request,
    "data:image/jpeg;base64,AQ==",
  );
  assert.equal(minimax.body.model, "image-01");
  assert.deepEqual(minimax.body.subject_reference, [
    { type: "character", image_file: "data:image/jpeg;base64,AQ==" },
  ]);
});
