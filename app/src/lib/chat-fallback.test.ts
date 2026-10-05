import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Idol } from "@/lib/idols";
import { recoverDanglingSend, withSendErrorBubble, withDanglingSendError, CHAT_SEND_ERROR_COPY } from "@/lib/chat-fallback";
import { keepSentThread, preferLiveThread, threadFromLocalHistory, withOptimisticUserMessage } from "@/lib/thread";
import {
  beginChatSend,
  chatSessionKey,
  endChatSend,
  getChatSendSnapshot,
  resetChatSendLockForTests,
} from "@/lib/chat-send-lock";

function idol(partial: Partial<Idol> = {}): Idol {
  return {
    tokenId: 1,
    isPublic: true,
    subscriberCount: 1,
    receiptsUsdc: 0,
    name: "Natalie100x",
    bio: "hi",
    personality: "",
    look: "",
    voice: "eve",
    website: "",
    twitter: "",
    welcome: "",
    scenes: [
      {
        id: "late-night",
        heading: "深夜",
        opening: "hey",
        seedUser: "在吗",
        choices: ["继续聊", "想你了"],
      },
    ],
    subscribePriceUsdc: 1,
    imageUnlockPriceUsdc: 1,
    salePriceUsdc: 0,
    avatar: "",
    covers: [],
    banner: "",
    photos: [],
    scenePhotoUrls: {},
    mediaContentRating: {},
    ...partial,
  };
}

describe("withSendErrorBubble", () => {
  it("lands a send failure as a distinct error bubble and keeps chips", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了", "tmp-1");
    let n = 0;
    const failed = withSendErrorBubble(optimistic, CHAT_SEND_ERROR_COPY, () => `err-${++n}`);
    const kept = keepSentThread(optimistic, failed);

    assert.equal(kept.messages.some((m) => m.role === "user" && m.content === "想你了"), true);
    const err = kept.messages.at(-1);
    assert.equal(err?.error, true);
    assert.equal(err?.content, CHAT_SEND_ERROR_COPY);
    assert.notEqual(err?.content, "信号有点卡，你再说一次嘛。");
    assert.deepEqual(kept.choicesByChapter[0], []);
  });

  it("turns a dangling user send after a remount into an error bubble", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了嘛", "tmp-1");
    let n = 0;
    const recovered = withDanglingSendError(optimistic, CHAT_SEND_ERROR_COPY, () => `err-${++n}`);
    assert.equal(recovered.messages.at(-2)?.content, "想你了嘛");
    assert.equal(recovered.messages.at(-1)?.error, true);
    assert.equal(recovered.messages.at(-1)?.content, CHAT_SEND_ERROR_COPY);
    assert.equal(withDanglingSendError(baseline).messages.at(-1)?.error, undefined);
  });

  it("does not treat an in-flight chip send as a killed send", () => {
    resetChatSendLockForTests();
    const key = chatSessionKey("dev-user", 1);
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了嘛", "tmp-1");
    assert.equal(beginChatSend(key, "想你了嘛"), true);
    let n = 0;
    const loaded = recoverDanglingSend(
      optimistic,
      Boolean(getChatSendSnapshot(key)),
      CHAT_SEND_ERROR_COPY,
      () => `err-${++n}`,
    );
    assert.equal(loaded.messages.some((m) => m.error), false);
    assert.equal(loaded.messages.at(-1)?.content, "想你了嘛");
    const applied = getChatSendSnapshot(key) ? optimistic : preferLiveThread(optimistic, loaded);
    assert.equal(applied.messages.some((m) => m.error), false);
    endChatSend(key);
    const recovered = recoverDanglingSend(
      optimistic,
      Boolean(getChatSendSnapshot(key)),
      CHAT_SEND_ERROR_COPY,
      () => `err-${++n}`,
    );
    assert.equal(recovered.messages.at(-1)?.error, true);
    assert.equal(recovered.messages.at(-1)?.content, CHAT_SEND_ERROR_COPY);
  });
});
