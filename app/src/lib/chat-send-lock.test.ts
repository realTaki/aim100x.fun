import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ChatThread } from "@/lib/thread";
import {
  beginChatSend,
  chatSessionKey,
  endChatSend,
  getChatSendSnapshot,
  isChatSendInFlight,
  peekLiveThread,
  publishLiveThread,
  resetChatSendLockForTests,
  subscribeLiveThread,
} from "@/lib/chat-send-lock";
import { isUnauthorized } from "@/lib/utils";
import { CHAT_SEND_ERROR_COPY } from "@/lib/chat-fallback";

function thread(messages: ChatThread["messages"]): ChatThread {
  return {
    chapter: 0,
    sceneId: "late-night",
    sceneImages: 0,
    messages,
    choicesByChapter: { 0: ["没啥，随便看看", "想你了嘛"] },
    usedImageIds: [],
  };
}

describe("chat send lock", () => {
  it("drops the same chip while the first send is in flight", () => {
    resetChatSendLockForTests();
    const key = chatSessionKey("dev-user", 1);
    assert.equal(beginChatSend(key, "想你了嘛"), true);
    assert.equal(beginChatSend(key, "想你了嘛"), false);
    assert.equal(beginChatSend(key, "没啥，随便看看"), false);
    assert.equal(getChatSendSnapshot(key), "想你了嘛");
    assert.equal(isChatSendInFlight(key), true);
    endChatSend(key);
    assert.equal(getChatSendSnapshot(key), "");
    assert.equal(isChatSendInFlight(key), false);
    assert.equal(beginChatSend(key, "想你了嘛"), true);
    endChatSend(key);
  });

  it("notifies a remounted subscriber when the error bubble is published", () => {
    resetChatSendLockForTests();
    const key = chatSessionKey("dev-user", 1);
    const optimistic = thread([
      { id: "u1", role: "user", content: "想你了嘛", chapter: 0 },
    ]);
    publishLiveThread(key, optimistic);
    assert.equal(peekLiveThread(key)?.messages.at(-1)?.content, "想你了嘛");

    let seen = "";
    const stop = subscribeLiveThread(key, (t) => {
      seen = t.messages.find((m) => m.error)?.content ?? "";
    });
    publishLiveThread(key, {
      ...optimistic,
      messages: [
        ...optimistic.messages,
        { id: "e1", role: "assistant", content: CHAT_SEND_ERROR_COPY, chapter: 0, error: true },
      ],
    });
    stop();
    assert.equal(seen, CHAT_SEND_ERROR_COPY);
    assert.equal(peekLiveThread(key)?.messages.some((m) => m.error), true);
  });

  it("drops a stale in-memory publish after a history reset", () => {
    resetChatSendLockForTests();
    const key = chatSessionKey("dev-user", 1);
    const oldThread = thread([
      { id: "u1", role: "user", content: "想你了", chapter: 0 },
      { id: "a1", role: "assistant", content: "我也想", chapter: 0 },
    ]);
    const resetThread = {
      ...thread([{ id: "open", role: "assistant", content: "hey", chapter: 0 }]),
      generation: 1,
    };
    publishLiveThread(key, oldThread);
    publishLiveThread(key, resetThread);
    publishLiveThread(key, oldThread);
    assert.equal(peekLiveThread(key)?.generation, 1);
    assert.equal(peekLiveThread(key)?.messages.some((m) => m.content === "想你了"), false);
    assert.equal(peekLiveThread(key)?.messages.at(-1)?.content, "hey");
  });
});

describe("unauthorized is not a chat network bubble", () => {
  it("detects UnauthorizedError / 401 and leaves network copy distinct", () => {
    assert.equal(isUnauthorized({ message: "Unauthorized" }), true);
    assert.equal(isUnauthorized({ message: "Unauthorized", status: 401, name: "UnauthorizedError" }), true);
    assert.equal(isUnauthorized({ message: "Unauthorized: expired session" }), true);
    assert.equal(isUnauthorized({ message: "Failed to fetch" }), false);
    assert.equal(isUnauthorized({ message: CHAT_SEND_ERROR_COPY }), false);
    assert.notEqual(CHAT_SEND_ERROR_COPY, "Unauthorized");
    assert.equal(CHAT_SEND_ERROR_COPY.includes("Unauthorized"), false);
  });
});
