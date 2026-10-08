import assert from "node:assert/strict";
import { it } from "node:test";
import { chatPhotoTools, parseChatToolCalls } from "./chat-tools.ts";
import { imageGenerateRequest, chatPromptCacheKey, imageMime } from "./ai-provider.ts";
import { expandSceneLibrary } from "./image-gen.ts";
import { synthesizeChatVoice } from "./chat-voice.server.ts";
import type { Idol } from "./idols.ts";

it("offers executable tools and requires spoken text for send_voice", () => {
  assert.deepEqual(chatPhotoTools([], { voiceEnabled: false, generationEnabled: false }), []);
  assert.deepEqual(
    chatPhotoTools([{ id: "photo" }], { voiceEnabled: false }).map((t) => t.function.name),
    ["send_photo", "generate_new_photos"],
  );
  assert.equal(
    parseChatToolCalls({
      tool_calls: [{ function: { name: "send_voice", arguments: '{"text":" "}' } }],
    }).sendVoice,
    false,
  );
  const decision = parseChatToolCalls({
    toolCalls: [
      { type: "function", function: { name: "send_voice", arguments: '{"text":"Bonjour"}' } },
    ],
  });
  assert.equal(decision.voiceText, "Bonjour");
  assert.equal(decision.sendVoice, true);
});

it("uses MiniMax's supported character reference shape and preserves provider formats", () => {
  const body = imageGenerateRequest(
    { kind: "x402", apiKey: "", imageModel: "image-01" },
    {
      prompt: "portrait",
      count: 1,
      contentRating: "SFW",
      referenceImage: "data:image/png;base64,fixture",
    },
  ).body;
  assert.deepEqual(body.subject_reference, [
    { type: "character", image_file: "data:image/png;base64,fixture" },
  ]);
  assert.equal(imageMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "image/png");
  assert.equal(imageMime(Buffer.from([255, 216, 255])), "image/jpeg");
  assert.throws(() => imageMime(Buffer.from("error")));
  assert.equal(
    chatPromptCacheKey("0xABC", "idol:1:reply"),
    chatPromptCacheKey("0xabc", "idol:1:reply"),
  );
  assert.notEqual(
    chatPromptCacheKey("wallet-a", "idol:1:reply"),
    chatPromptCacheKey("wallet-b", "idol:1:reply"),
  );
});

it("restocks with a reference when available, respects the cap, and preserves format without ffmpeg", async () => {
  const original = Buffer.alloc(100, 1);
  let cap = 0,
    generations = 0,
    published = 0;
  const deps: NonNullable<Parameters<typeof expandSceneLibrary>[1]> = {
    resolveUserAiBackend: async () => ({ kind: "x402", apiKey: "" }),
    loadIdolByTokenId: async () =>
      ({ tokenId: 7, avatar: "", covers: [], photos: [] }) as unknown as Idol,
    countSceneImages: async () => cap,
    loadIdolImageReference: async () => undefined,
    generatePaidImages: async (_backend, request) => {
      generations++;
      assert.equal(request.count, 1);
      assert.equal(request.referenceImage, undefined);
      return [{ b64: original.toString("base64"), mime: "image/png" }];
    },
    resizeJpegToPixels: async () => null,
    insertGeneratedImage: async (input) => {
      published++;
      assert.equal(input.mime, "image/png");
      assert.deepEqual(input.bytes, original);
      assert.equal(input.tokenId, 7);
      assert.equal(input.sceneId, "scene");
      assert.equal(input.contentRating, "NSFW");
      return { id: "photo", url: "/api/media/photo" };
    },
  };
  const input = {
    tokenId: 7,
    sceneId: "scene",
    triggerUserId: "0x1111111111111111111111111111111111111111",
    messages: [],
    contentRating: "NSFW" as const,
    prompt: "Complete adult appearance and scene",
  };
  assert.equal(await expandSceneLibrary(input, deps), 1);
  cap = 100;
  assert.equal(await expandSceneLibrary(input, deps), 0);
  assert.equal(generations, 1);
  assert.equal(published, 1);
  cap = 0;
  const converted = Buffer.alloc(100, 2);
  assert.equal(
    await expandSceneLibrary(input, {
      ...deps,
      resizeJpegToPixels: async () => converted,
      insertGeneratedImage: async (image) => {
        assert.equal(image.mime, "image/jpeg");
        assert.deepEqual(image.bytes, converted);
        return { id: "photo", url: "/api/media/photo" };
      },
    }),
    1,
  );
  const reference = "data:image/jpeg;base64,portrait";
  assert.equal(
    await expandSceneLibrary(input, {
      ...deps,
      loadIdolImageReference: async () => reference,
      generatePaidImages: async (_backend, request) => {
        assert.equal(request.referenceImage, reference);
        return [{ b64: original.toString("base64"), mime: "image/png" }];
      },
    }),
    1,
  );
  assert.equal(
    await expandSceneLibrary(input, {
      ...deps,
      loadIdolImageReference: async () => {
        throw new Error("R2 unavailable");
      },
      generatePaidImages: async () => {
        assert.fail("Must not generate without an existing reference");
      },
    }),
    0,
  );
});

it("authorizes voice use and resolves the current Neon voice with automatic language", async () => {
  let allowed = false,
    requests = 0;
  const deps: NonNullable<Parameters<typeof synthesizeChatVoice>[1]> = {
    isFanMembershipActive: async (userId, tokenId) => {
      assert.equal(userId, "0x1111111111111111111111111111111111111111");
      assert.equal(tokenId, 7);
      return allowed;
    },
    loadIdolByTokenId: async () => ({ voice: "current-neon-voice" }) as unknown as Idol,
    resolveUserAiBackend: async () => ({ kind: "x402", apiKey: "" }),
    postAiRequest: async (backend, request) => {
      requests++;
      assert.equal(backend.kind, "x402");
      const body = request.body;
      assert.equal((body.voice_setting as { voice_id: string }).voice_id, "current-neon-voice");
      assert.equal(body.language_boost, "auto");
      assert.equal(body.text, "こんにちは");
      return new Response(
        JSON.stringify({ base_resp: { status_code: 0 }, data: { audio: "ff00".repeat(40) } }),
      );
    },
  };
  const input = {
    userId: "0x1111111111111111111111111111111111111111",
    tokenId: 7,
    text: "こんにちは",
  };
  assert.deepEqual(await synthesizeChatVoice(input, deps), { ok: false });
  assert.equal(requests, 0);
  allowed = true;
  assert.deepEqual(await synthesizeChatVoice(input, deps), {
    ok: true,
    audioBase64: Buffer.from("ff00".repeat(40), "hex").toString("base64"),
  });
  assert.deepEqual(
    await synthesizeChatVoice(input, {
      ...deps,
      loadIdolByTokenId: async () => ({ voice: "" }) as unknown as Idol,
    }),
    { ok: false },
  );
  assert.equal(requests, 1);
});
