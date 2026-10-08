import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clipModelHistory,
  fanShortcutChoices,
  isFanShortcutChoice,
  MODEL_HISTORY_LIMIT,
  MODEL_HISTORY_MAX_CHARS,
  sanitizeIdolReply,
  userWantsPhoto,
} from "@/lib/chat-reply";

describe("sanitizeIdolReply", () => {
  it("strips fake photo markers and keeps the spoken line", () => {
    assert.equal(
      sanitizeIdolReply("[图片：刚拍的照片] 怎么样，这件衣服好看吗？"),
      "怎么样，这件衣服好看吗？",
    );
    assert.equal(sanitizeIdolReply("刚换了这件 (发送图片)"), "刚换了这件");
    assert.equal(
      sanitizeIdolReply(
        "嗯…刚洗完澡，好湿的。想看吗？ (using send_photo with id 3e1440f9f3b781aa902df3bbb8a41af8)",
      ),
      "嗯…刚洗完澡，好湿的。想看吗？",
    );
    assert.equal(sanitizeIdolReply("*sends a selfie* look"), "look");
  });

  it("strips wechat-send leftovers and trims surrounding whitespace", () => {
    assert.equal(sanitizeIdolReply("  拍好了，发你微信了，记得看。  "), "拍好了");
    assert.equal(sanitizeIdolReply("  发给你微信了  "), "");
  });
});

describe("clipModelHistory", () => {
  it("keeps the latest 40 turns and 280 characters, and drops errors", () => {
    const messages = Array.from({ length: MODEL_HISTORY_LIMIT + 5 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `#${i} ${"啊".repeat(MODEL_HISTORY_MAX_CHARS + 20)}`,
    }));
    messages.push({ role: "assistant", content: "failed", error: true } as never);
    messages.push({ role: "meta", content: "深夜私信" });
    const clipped = clipModelHistory(messages);
    assert.equal(clipped.length, MODEL_HISTORY_LIMIT);
    assert.equal(clipped[0]?.content.startsWith("#5 "), true);
    assert.equal(clipped.at(-1)?.content.startsWith(`#${MODEL_HISTORY_LIMIT + 4} `), true);
    assert.equal(
      clipped.every((m) => m.content.length <= MODEL_HISTORY_MAX_CHARS),
      true,
    );
    assert.equal(
      clipped.some((m) => m.content === "failed" || m.content === "深夜私信"),
      false,
    );
  });

  it("sanitizes a turn before it leaves the device", () => {
    const clipped = clipModelHistory([{ role: "assistant", content: "[图片：刚拍的照片] 怎么样" }]);
    assert.deepEqual(clipped, [{ role: "assistant", content: "怎么样" }]);
  });
});

describe("userWantsPhoto", () => {
  it("detects a request for a picture", () => {
    assert.equal(userWantsPhoto("再发一张"), true);
    assert.equal(userWantsPhoto("发张自拍"), true);
    assert.equal(userWantsPhoto("能拍张美足的照片吗？我喜欢看脚"), true);
    assert.equal(userWantsPhoto("过来抱抱"), false);
  });
});

describe("isFanShortcutChoice", () => {
  it("keeps fan drafts and drops idol-voice chips", () => {
    assert.equal(isFanShortcutChoice("转个身", "Sable"), true);
    assert.equal(isFanShortcutChoice("再来一张", "Sable"), true);
    assert.equal(isFanShortcutChoice("发张近的", "Sable"), true);
    assert.equal(isFanShortcutChoice("过来抱抱", "Sable"), false);
    assert.equal(isFanShortcutChoice("过来让我帮你擦", "Sable"), false);
    assert.equal(isFanShortcutChoice("头发滴到我身上了", "Sable"), false);
    assert.equal(isFanShortcutChoice("今天拍了一组新照片，想看吗？", "Sable"), false);
    assert.equal(isFanShortcutChoice("怎么样，这件衣服好看吗？", "Sable"), false);
    assert.equal(isFanShortcutChoice("给你看", "Sable"), false);
    assert.deepEqual(fanShortcutChoices(["转个身", "过来让我帮你擦"], "Sable"), ["转个身"]);
  });
});
