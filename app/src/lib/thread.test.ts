import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Idol } from "@/lib/idols";
import type { ChatThread } from "@/lib/thread";
import {
  DEFAULT_SHORTCUT_CHOICES,
  chipTurnKey,
  emptyThread,
  keepSentThread,
  needsGeneratedShortcutChoices,
  preferLiveThread,
  restartChatThread,
  foldVoiceIntoText,
  readLocalHistoryOrNull,
  seenImageIds,
  shortcutChoicesForIdol,
  threadChoices,
  threadFromLocalHistory,
  threadGeneration,
  threadNeedsLocalizedOpening,
  threadOpeningTexts,
  withLocalizedSeed,
  withoutDuplicateUserTurns,
  withOptimisticUserMessage,
  withShortcutChoices,
  withoutSeededUserMessages,
  type ChatMsg,
} from "@/lib/thread";
import { CHAT_SEND_ERROR_COPY, withSendErrorBubble } from "@/lib/chat-fallback";

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

describe("first chat empty history", () => {
  it("turns a missing local thread into a seeded empty thread", () => {
    const thread = threadFromLocalHistory(idol(), null);
    assert.equal(thread.chapter, 0);
    assert.equal(thread.sceneId, "late-night");
    assert.equal(thread.messages.length >= 1, true);
    assert.equal(thread.messages.some((m) => m.role === "assistant"), true);
    assert.deepEqual(thread.choicesByChapter[0], []);
    assert.deepEqual(thread.usedImageIds, []);
  });

  it("merges stored used ids with image bubbles", () => {
    const existing: ChatThread = {
      chapter: 0,
      sceneId: "late-night",
      sceneImages: 1,
      messages: [
        {
          id: "p",
          role: "assistant",
          content: "",
          chapter: 0,
          imageUrl: "/api/media/bbb",
        },
      ],
      choicesByChapter: { 0: [] },
      usedImageIds: ["aaa"],
    };
    assert.deepEqual(seenImageIds(existing), ["aaa", "bbb"]);
  });

  it("restarts chat text but keeps seen photo ids", () => {
    const existing: ChatThread = {
      chapter: 2,
      sceneId: "late-night",
      sceneImages: 3,
      messages: [
        {
          id: "p",
          role: "assistant",
          content: "look",
          chapter: 2,
          imageUrl: "/api/media/bbb",
        },
      ],
      choicesByChapter: { 2: ["再来一张"] },
      usedImageIds: ["aaa"],
    };
    const next = restartChatThread(idol(), existing);
    assert.equal(next.chapter, 0);
    assert.equal(next.messages.some((m) => m.id === "p"), false);
    assert.deepEqual(next.usedImageIds, ["aaa", "bbb"]);
    assert.deepEqual(next.photoUrls, ["/api/media/bbb"]);
    assert.equal(threadGeneration(next), 1);
  });

  it("restart reseeds creator-typed 欢迎词 then opening, not a cached English rewrite", () => {
    const source = idol({
      welcome: "感谢你订阅我",
      scenes: [
        {
          id: "late-night",
          topic: "深夜私信",
          opening: "嘿，这么晚还不睡？是不是想我了。",
        },
      ],
    });
    const existing: ChatThread = {
      ...emptyThread(source),
      locale: "en",
      localizedOpening: "Thanks for subscribing to me.",
      localizedHeading: "Late night DMs",
      usedImageIds: [],
    };
    const next = restartChatThread(source, existing);
    assert.equal(next.locale, undefined);
    assert.equal(next.localizedOpening, undefined);
    assert.deepEqual(
      next.messages.map((m) => [m.role, m.content]),
      [
        ["meta", "深夜私信"],
        ["assistant", "感谢你订阅我"],
        ["assistant", "嘿，这么晚还不睡？是不是想我了。"],
      ],
    );
    assert.equal(threadNeedsLocalizedOpening(next, "en"), true);
  });

  it("applies prefer-language seed onto 欢迎词, opening, and heading", () => {
    const source = idol({
      welcome: "感谢你订阅我",
      scenes: [
        {
          id: "late-night",
          topic: "深夜私信",
          opening: "嘿，这么晚还不睡？是不是想我了。",
        },
      ],
    });
    const seeded = withLocalizedSeed(
      emptyThread(source),
      "en",
      "Can't sleep either? Thinking about me.",
      "Late night DMs",
      "Thanks for subscribing to me.",
    );
    assert.equal(seeded.locale, "en");
    assert.deepEqual(threadOpeningTexts(seeded), {
      heading: "Late night DMs",
      welcome: "Thanks for subscribing to me.",
      opening: "Can't sleep either? Thinking about me.",
    });
    assert.deepEqual(
      seeded.messages.map((m) => [m.role, m.content]),
      [
        ["meta", "Late night DMs"],
        ["assistant", "Thanks for subscribing to me."],
        ["assistant", "Can't sleep either? Thinking about me."],
      ],
    );
  });

  it("does not overwrite 欢迎词 when only the opening is rewritten", () => {
    const source = idol({
      welcome: "感谢你订阅我",
      scenes: [
        {
          id: "late-night",
          topic: "深夜私信",
          opening: "嘿，这么晚还不睡？是不是想我了。",
        },
      ],
    });
    const seeded = withLocalizedSeed(
      emptyThread(source),
      "en",
      "Can't sleep either?",
      "Late night DMs",
    );
    assert.deepEqual(
      seeded.messages.map((m) => [m.role, m.content]),
      [
        ["meta", "Late night DMs"],
        ["assistant", "感谢你订阅我"],
        ["assistant", "Can't sleep either?"],
      ],
    );
  });

  it("does not English-ify a creator-typed English 欢迎词 or opening", () => {
    const source = idol({
      welcome: "Thanks for subscribing. Stay.",
      scenes: [{ id: "late-night", opening: "Can't sleep either?" }],
    });
    const thread = emptyThread(source);
    assert.deepEqual(
      thread.messages.map((m) => [m.role, m.content]),
      [
        ["assistant", "Thanks for subscribing. Stay."],
        ["assistant", "Can't sleep either?"],
      ],
    );
  });

  it("folds a voice-only bubble into the previous text", () => {
    const folded = foldVoiceIntoText([
      { id: "t", role: "assistant", content: "想你了", chapter: 0 },
      { id: "v", role: "assistant", content: "", chapter: 0, audioUrl: "data:audio/mpeg;base64,x" },
    ]);
    assert.equal(folded.length, 1);
    assert.equal(folded[0]?.content, "想你了");
    assert.equal(folded[0]?.audioUrl, "data:audio/mpeg;base64,x");
  });

  it("does not keep a spinner after audio is already attached", () => {
    const folded = foldVoiceIntoText([
      { id: "t", role: "assistant", content: "想你了", chapter: 0, audioUrl: "data:audio/mpeg;base64,x" },
      { id: "p", role: "assistant", content: "", chapter: 0, voicePending: true },
    ]);
    assert.equal(folded.length, 1);
    assert.equal(folded[0]?.audioUrl, "data:audio/mpeg;base64,x");
    assert.equal(folded[0]?.voicePending, undefined);
  });

  it("leaves empty chips on an existing thread so the client can generate them", () => {
    const existing: ChatThread = {
      chapter: 0,
      sceneId: "late-night",
      sceneImages: 0,
      messages: [{ id: "m1", role: "assistant", content: "hey", chapter: 0 }],
      choicesByChapter: { 0: [] },
      usedImageIds: [],
    };
    const thread = threadFromLocalHistory(idol(), existing);
    assert.equal(thread.messages[0]?.id, "m1");
    assert.deepEqual(thread.choicesByChapter[0], []);
    assert.deepEqual(threadChoices(thread), []);
  });

  it("keeps live chips already stored on an existing thread", () => {
    const existing: ChatThread = {
      chapter: 2,
      sceneId: "kept",
      sceneImages: 0,
      messages: [{ id: "m1", role: "user", content: "hi", chapter: 2 }],
      choicesByChapter: { 2: ["ok"] },
      usedImageIds: ["abc"],
    };
    const thread = threadFromLocalHistory(idol(), existing);
    assert.equal(thread.sceneId, "kept");
    assert.equal(thread.messages[0]?.id, "m1");
    assert.deepEqual(thread.choicesByChapter[2], ["ok"]);
  });

  it("treats thrown OPFS/history reads as missing, not failure", async () => {
    const loaded = await readLocalHistoryOrNull(async () => {
      throw new Error("no such table: chat_threads");
    });
    assert.equal(loaded, null);
    const thread = threadFromLocalHistory(idol(), loaded);
    assert.equal(thread.sceneId, emptyThread(idol()).sceneId);
    assert.equal(thread.messages.length, emptyThread(idol()).messages.length);
  });

  it("seeds a first chat even when the idol has no heading or seed user", () => {
    const thread = threadFromLocalHistory(
      idol({ scenes: [{ id: "late-night", opening: "hey" }] }),
      null,
    );
    assert.equal(thread.messages.length, 1);
    assert.equal(thread.messages[0]?.role, "assistant");
    assert.equal(thread.messages[0]?.content, "hey");
    assert.deepEqual(thread.choicesByChapter[0], []);
  });

  it("uses topic as the first-chat heading", () => {
    const thread = threadFromLocalHistory(
      idol({
        scenes: [
          {
            id: "late-night",
            topic: "深夜私信",
            scene: "卧室灯还亮着。",
            opening: "嘿，这么晚还不睡？是不是想我了。",
          },
        ],
      }),
      null,
    );
    assert.equal(thread.messages[0]?.role, "meta");
    assert.equal(thread.messages[0]?.content, "深夜私信");
    assert.equal(thread.messages[1]?.role, "assistant");
    assert.equal(thread.messages[1]?.content, "嘿，这么晚还不睡？是不是想我了。");
  });

  it("does not inject scene seedUser as a fake first user bubble", () => {
    const thread = threadFromLocalHistory(idol(), null);
    assert.equal(thread.messages.some((m) => m.role === "user"), false);
    assert.equal(thread.messages.some((m) => m.content === "在吗"), false);
    assert.equal(thread.messages.at(-1)?.role, "assistant");
    assert.equal(thread.messages.at(-1)?.content, "hey");
  });

  it("writes 欢迎词 as an assistant line before the scene opening", () => {
    const thread = threadFromLocalHistory(
      idol({
        welcome: "感谢你订阅我",
        scenes: [
          {
            id: "late-night",
            topic: "深夜私信",
            opening: "嘿，这么晚还不睡？是不是想我了。",
          },
        ],
      }),
      null,
    );
    assert.equal(thread.messages.some((m) => m.role === "user"), false);
    assert.deepEqual(
      thread.messages.map((m) => [m.role, m.content]),
      [
        ["meta", "深夜私信"],
        ["assistant", "感谢你订阅我"],
        ["assistant", "嘿，这么晚还不睡？是不是想我了。"],
      ],
    );
  });

  it("does not write an empty 欢迎词 bubble", () => {
    const thread = threadFromLocalHistory(idol({ welcome: "  " }), null);
    assert.equal(thread.messages.some((m) => m.content === ""), false);
    assert.equal(thread.messages.filter((m) => m.role === "assistant").length, 1);
    assert.equal(thread.messages.at(-1)?.content, "hey");
  });

  it("does not overwrite an existing OPFS thread with 欢迎词", () => {
    const existing: ChatThread = {
      chapter: 0,
      sceneId: "late-night",
      sceneImages: 0,
      messages: [{ id: "open-1", role: "assistant", content: "hey", chapter: 0 }],
      choicesByChapter: { 0: [] },
      usedImageIds: [],
    };
    const thread = threadFromLocalHistory(idol({ welcome: "感谢你订阅我" }), existing);
    assert.deepEqual(
      thread.messages.map((m) => [m.role, m.content]),
      [["assistant", "hey"]],
    );
  });

  it("drops a leftover OPFS user line that sat before the opening", () => {
    const existing: ChatThread = {
      chapter: 0,
      sceneId: "late-night",
      sceneImages: 0,
      messages: [
        { id: "meta-1", role: "meta", content: "深夜", chapter: 0 },
        { id: "seed-hi", role: "user", content: "嗨", chapter: 0 },
        { id: "open-1", role: "assistant", content: "hey", chapter: 0 },
      ],
      choicesByChapter: { 0: [] },
      usedImageIds: [],
    };
    const thread = threadFromLocalHistory(idol(), existing);
    assert.deepEqual(
      thread.messages.map((m) => m.id),
      ["meta-1", "open-1"],
    );
    assert.equal(thread.messages.some((m) => m.role === "user"), false);
  });

  it("keeps a real send after the idol opening, including 嗨", () => {
    const existing: ChatThread = {
      chapter: 0,
      sceneId: "late-night",
      sceneImages: 0,
      messages: [
        { id: "open-1", role: "assistant", content: "hey", chapter: 0 },
        { id: "real-1", role: "user", content: "嗨", chapter: 0 },
        { id: "reply-1", role: "assistant", content: "想我了？", chapter: 0 },
      ],
      choicesByChapter: { 0: [] },
      usedImageIds: [],
    };
    const thread = threadFromLocalHistory(idol(), existing);
    assert.equal(thread.messages.some((m) => m.id === "real-1"), true);
    assert.equal(thread.messages.find((m) => m.id === "real-1")?.content, "嗨");
  });

  it("does not drop a user-only dangling send when there is no opening yet", () => {
    const dangling: ChatMsg[] = [{ id: "tmp-1", role: "user", content: "想你了", chapter: 0 }];
    assert.deepEqual(withoutSeededUserMessages(dangling), dangling);
  });
});

describe("shortcut chips on enter", () => {
  it("treats scene JSON and generic pairs as canned, not live", () => {
    assert.deepEqual(shortcutChoicesForIdol(idol(), 0), ["继续聊", "想你了"]);
    assert.equal(needsGeneratedShortcutChoices(idol(), 0, ["继续聊", "想你了"]), true);
    assert.equal(needsGeneratedShortcutChoices(idol(), 0, ["过来抱抱", "想看你跳舞"]), false);
    assert.equal(
      needsGeneratedShortcutChoices(
        idol({ scenes: [{ id: "late-night", opening: "hey", choices: ["没啥，随便看看", "想你了嘛"] }] }),
        0,
        ["没啥，随便看看", "想你了嘛"],
      ),
      true,
    );
    assert.deepEqual(
      shortcutChoicesForIdol(idol({ scenes: [{ id: "late-night", opening: "hey" }] }), 0),
      [...DEFAULT_SHORTCUT_CHOICES],
    );
  });

  it("clears stored chips on send; load-time refill is separate", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了", "tmp-1");
    assert.deepEqual(optimistic.choicesByChapter[0], []);
    assert.equal(threadChoices(optimistic).length, 0);
    assert.deepEqual(withShortcutChoices(idol(), optimistic).choicesByChapter[0], ["继续聊", "想你了"]);
  });

  it("does not change the chip turn when an image bubble is appended", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const spoken: ChatThread = {
      ...baseline,
      messages: [
        ...baseline.messages,
        { id: "a1", role: "assistant", content: "刚换了这件", chapter: 0 },
      ],
    };
    const pending: ChatThread = {
      ...spoken,
      messages: [
        ...spoken.messages,
        { id: "img-p", role: "assistant", content: "", chapter: 0, imagePending: true },
      ],
    };
    assert.equal(chipTurnKey(spoken), "0:a1");
    assert.equal(chipTurnKey(pending), chipTurnKey(spoken));
  });
});

describe("shortcut send stays in the thread", () => {
  it("adds the chip text as an optimistic user message and clears choices", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了", "tmp-1");
    assert.equal(optimistic.messages.at(-1)?.content, "想你了");
    assert.equal(optimistic.messages.at(-1)?.role, "user");
    assert.deepEqual(optimistic.choicesByChapter[0], []);
    assert.equal(optimistic.messages.length, baseline.messages.length + 1);
  });

  it("does not roll back to the unsent thread when sendChat or persist fails", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了", "tmp-1");
    assert.equal(keepSentThread(optimistic, null).messages.at(-1)?.content, "想你了");
    assert.equal(keepSentThread(optimistic, baseline).messages.at(-1)?.content, "想你了");
    assert.notEqual(keepSentThread(optimistic, baseline).messages.length, baseline.messages.length);
  });

  it("keeps a successful server thread that includes the same user text", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了", "tmp-1");
    const server: ChatThread = {
      ...optimistic,
      messages: [
        ...baseline.messages,
        { id: "real-user", role: "user", content: "想你了", chapter: 0 },
        { id: "real-asst", role: "assistant", content: "我也想", chapter: 0 },
      ],
      choicesByChapter: { 0: ["再来"] },
    };
    const kept = keepSentThread(optimistic, server);
    assert.equal(kept.messages.at(-1)?.content, "我也想");
    assert.equal(kept.messages.some((m) => m.content === "想你了"), true);
  });

  it("collapses a consecutive duplicate user send", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const duped: ChatThread = {
      ...baseline,
      messages: [
        ...baseline.messages,
        { id: "tmp", role: "user", content: "太好看了 身材绝了", chapter: 0 },
        { id: "real", role: "user", content: "太好看了 身材绝了", chapter: 0 },
        { id: "asst", role: "assistant", content: "天生的", chapter: 0 },
      ],
    };
    assert.equal(withoutDuplicateUserTurns(duped.messages).filter((m) => m.role === "user").length, 1);
    const loaded = threadFromLocalHistory(idol(), duped);
    assert.equal(loaded.messages.filter((m) => m.role === "user" && m.content.includes("太好看了")).length, 1);
    const live = preferLiveThread(baseline, duped);
    assert.equal(live.messages.filter((m) => m.role === "user" && m.content.includes("太好看了")).length, 1);
  });
});

describe("preferLiveThread", () => {
  it("keeps the on-screen thread when a refetch is shorter", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了嘛", "tmp-1");
    const kept = preferLiveThread(optimistic, baseline);
    assert.equal(kept.messages.at(-1)?.content, "想你了嘛");
    assert.equal(kept.messages.length, optimistic.messages.length);
  });

  it("does not drop an in-thread send-error bubble for an equally long snapshot", () => {
    const baseline = threadFromLocalHistory(idol(), null);
    const optimistic = withOptimisticUserMessage(baseline, "想你了嘛", "tmp-1");
    const withError = withSendErrorBubble(optimistic, CHAT_SEND_ERROR_COPY, () => "err-1");
    const sameLengthNoError = {
      ...withError,
      messages: withError.messages.map((m) => (m.error ? { ...m, error: undefined, content: "…" } : m)),
    };
    const kept = preferLiveThread(withError, sameLengthNoError);
    assert.equal(kept.messages.some((m) => m.error), true);
    assert.equal(kept.messages.find((m) => m.error)?.content, CHAT_SEND_ERROR_COPY);
  });

  it("lets a history reset replace a longer in-memory transcript", () => {
    const baseline = threadFromLocalHistory(idol({ welcome: "感谢你订阅我" }), null);
    const lived: ChatThread = {
      ...baseline,
      messages: [
        ...baseline.messages,
        { id: "u1", role: "user", content: "想你了", chapter: 0 },
        { id: "a1", role: "assistant", content: "我也想", chapter: 0 },
      ],
    };
    const reset = restartChatThread(idol({ welcome: "感谢你订阅我" }), lived);
    const fromChat = preferLiveThread(lived, reset);
    const fromOpfs = preferLiveThread(reset, lived);
    assert.equal(fromChat.generation, 1);
    assert.equal(fromOpfs.generation, 1);
    assert.equal(fromChat.messages.some((m) => m.content === "想你了"), false);
    assert.equal(fromOpfs.messages.some((m) => m.content === "想你了"), false);
    assert.equal(fromChat.messages.some((m) => m.content === "感谢你订阅我"), true);
  });
});
