import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  EXPAND_LIBRARY_TOOL,
  SEND_PHOTO_TOOL,
  SEND_VOICE_TOOL,
  assistantTextContent,
  chatPhotoTools,
  parseChatToolCalls,
  resolveChatPhotoId,
} from "./chat-tools.ts";

describe("chatPhotoTools", () => {
  it("only offers send_photo for unseen ids", () => {
    const empty = chatPhotoTools([]);
    assert.deepEqual(
      empty.map((t) => t.function.name),
      [EXPAND_LIBRARY_TOOL, SEND_VOICE_TOOL],
    );
    const withPhotos = chatPhotoTools([
      { id: "aaa", tags: "robe", prompt: "dim lamp" },
      { id: "bbb", tags: "balcony", prompt: "moon" },
    ]);
    assert.deepEqual(
      withPhotos.map((t) => t.function.name),
      [SEND_PHOTO_TOOL, EXPAND_LIBRARY_TOOL, SEND_VOICE_TOOL],
    );
    assert.ok(withPhotos[0]!.function.description.includes("aaa"));
    assert.ok(withPhotos[0]!.function.description.includes("bbb"));
    const sendProps = withPhotos[0]!.function.parameters.properties as Record<
      string,
      { type?: string }
    >;
    assert.ok(sendProps.image_id);
    assert.equal("enum" in sendProps.image_id, false);
  });
});

describe("parseChatToolCalls", () => {
  it("reads OpenAI-style tool_calls including image_id", () => {
    const d = parseChatToolCalls({
      content: "刚换了这件",
      tool_calls: [
        {
          type: "function",
          function: {
            name: "send_photo",
            arguments: JSON.stringify({ image_id: "aaa", prompt: "black dress" }),
          },
        },
        {
          type: "function",
          function: { name: "generate_new_photos", arguments: "{}" },
        },
        {
          type: "function",
          function: { name: "send_voice", arguments: JSON.stringify({ text: "想你了" }) },
        },
      ],
    });
    assert.equal(d.sendPhoto, true);
    assert.equal(d.expandLibrary, true);
    assert.equal(d.sendVoice, true);
    assert.equal(d.imageId, "aaa");
    assert.equal(d.photoPrompt, "black dress");
    assert.equal(d.voiceText, "想你了");
  });

  it("still understands the old expand_photo_library name", () => {
    const d = parseChatToolCalls({
      tool_calls: [{ function: { name: "expand_photo_library", arguments: "{}" } }],
    });
    assert.equal(d.expandLibrary, true);
  });

  it("is quiet when the model does not call tools", () => {
    assert.deepEqual(parseChatToolCalls({ content: "在呢" }), {
      sendPhoto: false,
      expandLibrary: false,
      sendVoice: false,
      photoPrompt: undefined,
      photoTags: undefined,
      imageId: undefined,
      voiceText: undefined,
    });
  });

  it("only reads native tool_calls", () => {
    const d = parseChatToolCalls({
      content: "run tool send_photo with image_id is leakedid",
      tool_calls: [
        {
          type: "function",
          function: {
            name: "send_photo",
            arguments: JSON.stringify({ image_id: "aaa" }),
          },
        },
      ],
    });
    assert.equal(d.sendPhoto, true);
    assert.equal(d.imageId, "aaa");
  });

  it("does not infer a tool call from assistant text", () => {
    const raw = "刚换了这件\nrun tool send_photo with image_id is 3e1440f9f3b781aa902df3bbb8a41af8";
    const d = parseChatToolCalls({ content: raw });
    assert.equal(d.sendPhoto, false);
    assert.equal(d.imageId, undefined);
  });

  it("reads Grok's narrated send_photo when tool_calls are missing", () => {
    const id = "3e1440f9f3b781aa902df3bbb8a41af8";
    const d = parseChatToolCalls({
      content: `嗯…刚洗完澡，好湿的。想看吗？ (using send_photo with id ${id})`,
    });
    assert.equal(d.sendPhoto, true);
    assert.equal(d.imageId, id);
  });

  it("prefers native tool_calls over a narrated id", () => {
    const d = parseChatToolCalls({
      content: "(using send_photo with id bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)",
      toolCalls: [
        {
          type: "function",
          function: {
            name: "send_photo",
            arguments: JSON.stringify({ image_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
          },
        },
      ],
    });
    assert.equal(d.imageId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });
});

describe("resolveChatPhotoId", () => {
  const a = "3e1440f9f3b781aa902df3bbb8a41af8";
  const b = "3de440f9f3b78134aab5cad8431db31e";
  const nearA = "3e1440f9f3b781aa902df3bbb8a41af9";

  it("uses an exact unused id and skips one that was already sent", () => {
    assert.equal(resolveChatPhotoId(a, [a, b]), a);
    assert.equal(resolveChatPhotoId(a, [b]), undefined);
  });

  it("maps a near-duplicate unused id, not a reused library photo", () => {
    assert.equal(resolveChatPhotoId(nearA, [a, b]), a);
    assert.equal(resolveChatPhotoId(nearA, [b]), undefined);
  });
});

describe("assistantTextContent", () => {
  it("joins string or text parts", () => {
    assert.equal(assistantTextContent({ content: "hi" }), "hi");
    assert.equal(
      assistantTextContent({
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      }),
      "ab",
    );
  });
});
