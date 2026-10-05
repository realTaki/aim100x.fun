import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_COMPLETION_TIMEOUT_MS,
  chatCompletionPayload,
  chatCompletionTimeoutSignal,
  chatCompletionUrl,
  decodeGeneratedImage,
  decodeGeneratedImages,
  decodeTtsAudio,
  imageEditRequest,
  imageGenerateRequest,
  isAiChatBodyOk,
  MINIMAX_API_HOST,
  MINIMAX_CN_API_KEY_ENV,
  MINIMAX_STT_HOST,
  postChatCompletions,
  resolveAiBackend,
  resolveMiniMaxBackend,
  sttRequest,
  ttsRequest,
  voiceDesignRequest,
} from "./ai-provider.ts";

const saved = {
  minimax: process.env.MINIMAX_CN_API_KEY,
};

afterEach(() => {
  if (saved.minimax === undefined) delete process.env.MINIMAX_CN_API_KEY;
  else process.env.MINIMAX_CN_API_KEY = saved.minimax;
  delete process.env.MINIMAX_API_KEY;
  delete process.env.XAI_API_KEY;
});

describe("resolveAiBackend", () => {
  it("uses MINIMAX_CN_API_KEY", () => {
    process.env.MINIMAX_CN_API_KEY = "mm-secret";
    assert.deepEqual(resolveAiBackend(), { kind: "minimax", apiKey: "mm-secret" });
  });

  it("ignores XAI_API_KEY", () => {
    delete process.env.MINIMAX_CN_API_KEY;
    process.env.XAI_API_KEY = "xai-secret";
    assert.equal(resolveAiBackend(), undefined);
  });

  it("treats blank MINIMAX_CN_API_KEY as missing", () => {
    process.env.MINIMAX_CN_API_KEY = "  ";
    process.env.XAI_API_KEY = "xai-secret";
    assert.equal(resolveAiBackend(), undefined);
  });

  it("returns undefined when the MiniMax key is unset", () => {
    delete process.env.MINIMAX_CN_API_KEY;
    assert.equal(resolveAiBackend(), undefined);
  });

  it("does not read MINIMAX_API_KEY", () => {
    delete process.env.MINIMAX_CN_API_KEY;
    process.env.MINIMAX_API_KEY = "old-name";
    assert.equal(MINIMAX_CN_API_KEY_ENV, "MINIMAX_CN_API_KEY");
    assert.equal(resolveAiBackend(), undefined);
  });
});

describe("resolveMiniMaxBackend", () => {
  it("does not fall back to XAI_API_KEY", () => {
    delete process.env.MINIMAX_CN_API_KEY;
    process.env.XAI_API_KEY = "xai-secret";
    assert.equal(resolveMiniMaxBackend(), undefined);
  });

  it("uses the CN MiniMax key", () => {
    process.env.MINIMAX_CN_API_KEY = "mm-secret";
    assert.deepEqual(resolveMiniMaxBackend(), { kind: "minimax", apiKey: "mm-secret" });
  });
});

describe("chat completion timeout", () => {
  it("aborts the model before Vercel Hobby's 60s maxDuration", () => {
    assert.equal(CHAT_COMPLETION_TIMEOUT_MS, 45_000);
    assert.equal(CHAT_COMPLETION_TIMEOUT_MS < 60_000, true);
    const signal = chatCompletionTimeoutSignal();
    assert.equal(signal.aborted, false);
  });

  it("forwards AbortSignal on POST /v1/chat/completions", async () => {
    const orig = globalThis.fetch;
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url, options) => {
      init = options as RequestInit;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const ac = new AbortController();
      await postChatCompletions({ kind: "minimax", apiKey: "k" }, { messages: [] }, { signal: ac.signal });
      assert.equal(init?.signal, ac.signal);
      assert.equal(String(init?.method), "POST");
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("chatCompletionPayload", () => {
  it("uses MiniMax-M3 with thinking disabled", () => {
    const payload = chatCompletionPayload({ temperature: 0.95, max_tokens: 280 });
    assert.equal(payload.model, "MiniMax-M3");
    assert.deepEqual(payload.thinking, { type: "disabled" });
    assert.equal(payload.temperature, 0.95);
  });

  it("drops tool_choice so native tools stay on the CN OpenAI schema", () => {
    const mm = chatCompletionPayload({
      tools: [{ type: "function" }],
      tool_choice: "auto",
    });
    assert.equal("tool_choice" in mm, false);
    assert.ok(mm.tools);
  });

  it("posts chat to the CN OpenAI-compatible host, not .io or xAI", () => {
    assert.equal(chatCompletionUrl(), "https://api.minimax.cn/v1/chat/completions");
    assert.equal(MINIMAX_API_HOST, "https://api.minimax.cn");
    assert.equal(chatCompletionUrl().includes("api.x.ai"), false);
  });
});

describe("image requests", () => {
  const mm = { kind: "minimax" as const, apiKey: "k" };
  const ref = "data:image/jpeg;base64,abc";
  const req = { prompt: "prompt", contentRating: "NSFW" as const };

  it("MiniMax uses official image_generation + subject_reference then text-only", () => {
    const edit = imageEditRequest(mm, req, ref);
    const gen = imageGenerateRequest(mm, req);
    assert.equal(edit.url, "https://api.minimax.cn/v1/image_generation");
    assert.equal(edit.body.model, "image-01");
    assert.deepEqual(edit.body.subject_reference, [
      { type: "character", image_file: ref },
    ]);
    assert.equal(edit.body.response_format, "base64");
    assert.equal(edit.body.width, 1152);
    assert.equal(edit.body.height, 1728);
    assert.equal(edit.body.n, 1);
    const pair = imageEditRequest(mm, { ...req, count: 2 }, ref);
    assert.equal(pair.body.n, 2);
    assert.equal(edit.body.aspect_ratio, undefined);
    assert.equal(gen.url, "https://api.minimax.cn/v1/image_generation");
    assert.equal(gen.body.subject_reference, undefined);
    assert.equal(gen.body.model, "image-01");
    assert.equal(gen.body.width, 1152);
    assert.equal(gen.body.height, 1728);
    assert.equal(edit.url.includes("api.x.ai"), false);
    assert.equal(gen.url.includes("api.x.ai"), false);
  });

  it("MiniMax avatar and banner pass exact pixels", () => {
    const avatar = imageGenerateRequest(mm, { prompt: "p", contentRating: "SFW", slot: "avatar" });
    const banner = imageGenerateRequest(mm, { prompt: "p", contentRating: "SFW", slot: "banner" });
    assert.equal(avatar.body.width, 1408);
    assert.equal(avatar.body.height, 1408);
    assert.equal(avatar.body.aspect_ratio, undefined);
    assert.equal(banner.body.width, 1792);
    assert.equal(banner.body.height, 1008);
    assert.equal(banner.body.aspect_ratio, undefined);
  });
});

describe("decodeGeneratedImage", () => {
  it("reads OpenAI-style b64_json", () => {
    assert.deepEqual(decodeGeneratedImage({ data: [{ b64_json: "qq" }] }), { b64: "qq" });
  });

  it("reads MiniMax image_base64", () => {
    assert.deepEqual(decodeGeneratedImage({ data: { image_base64: ["qq"] }, base_resp: { status_code: 0 } }), {
      b64: "qq",
    });
  });

  it("reads a MiniMax batch of two", () => {
    assert.equal(
      decodeGeneratedImages({ data: { image_base64: ["aa", "bb"] }, base_resp: { status_code: 0 } }).length,
      2,
    );
  });

  it("rejects MiniMax base_resp errors", () => {
    assert.equal(isAiChatBodyOk({ base_resp: { status_code: 1004 } }), false);
    assert.equal(isAiChatBodyOk({ choices: [{ message: { content: "{}" } }] }), true);
    assert.equal(
      decodeGeneratedImage({
        data: { image_base64: ["qq"] },
        base_resp: { status_code: 1004 },
      }),
      undefined,
    );
  });
});

describe("voice and speech", () => {
  it("MiniMax TTS/STT and voice design use CN paths with the generated voice id", () => {
    const backend = { kind: "minimax" as const, apiKey: "k" };
    const ttsRequestBody = ttsRequest(backend, "hi", "designed-voice", "zh");
    const tts = ttsRequestBody.url;
    const stt = sttRequest(backend).url;
    const design = voiceDesignRequest(backend, "warm voice", "你好");
    const edit = imageEditRequest(backend, { prompt: "p", contentRating: "SFW" }, "data:image/jpeg;base64,x").url;
    const gen = imageGenerateRequest(backend, { prompt: "p", contentRating: "SFW" }).url;
    const chat = chatCompletionUrl();
    for (const url of [tts, stt, design.url, edit, gen, chat]) {
      assert.equal(url.includes("minimax.io"), false);
    }
    assert.equal(tts, "https://api.minimax.cn/v1/t2a_v2");
    assert.deepEqual(ttsRequestBody.body.voice_setting, { voice_id: "designed-voice" });
    assert.equal(design.url, "https://api.minimax.cn/v1/voice_design");
    assert.deepEqual(design.body, { prompt: "warm voice", preview_text: "你好" });
    assert.equal(MINIMAX_STT_HOST, "https://api.minimaxi.com");
    assert.equal(stt, "https://api.minimaxi.com/v1/speech_to_text");
    assert.equal(sttRequest(backend).extraFields?.model, "asr-1.0");
  });

  it("decodes MiniMax hex TTS audio", () => {
    const hex = Buffer.alloc(80, 1).toString("hex");
    const b64 = decodeTtsAudio({ data: { audio: hex }, base_resp: { status_code: 0 } });
    assert.equal(b64, Buffer.alloc(80, 1).toString("base64"));
  });
});
