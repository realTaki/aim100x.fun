import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { ChatThread } from "@/lib/thread";
import { CHAT_SEND_ERROR_COPY } from "@/lib/chat-fallback";
import {
  appendMessages,
  applySchema,
  ftsSearch,
  getThreadFromDb,
  setThreadFull,
  type ChatSql,
} from "./sql.ts";
import {
  adoptThreadGeneration,
  isStaleThreadGeneration,
  resetThreadGenerationForTests,
} from "./generation.ts";

function memorySql(): ChatSql {
  const db = new DatabaseSync(":memory:");
  return {
    exec(sql) {
      db.exec(sql);
    },
    all(sql, params = []) {
      return db.prepare(sql).all(...(params as never[])) as Record<string, unknown>[];
    },
    run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
  };
}

function sampleThread(extraMessages: ChatThread["messages"] = []): ChatThread {
  return {
    chapter: 0,
    sceneId: "late-night",
    sceneImages: 0,
    choicesByChapter: { 0: ["继续聊", "想你了"] },
    usedImageIds: [],
    messages: [
      { id: "meta-1", role: "meta", content: "深夜", chapter: 0 },
      { id: "user-1", role: "user", content: "在吗", chapter: 0 },
      { id: "asst-1", role: "assistant", content: "hey", chapter: 0 },
      ...extraMessages,
    ],
  };
}

describe("chat-store sql empty history", () => {
  it("returns null for an empty database instead of throwing", () => {
    const db = applySchema(memorySql());
    assert.equal(getThreadFromDb(db, "0xabc", "1"), null);
  });

  it("returns null when the tables are missing", () => {
    const sql = memorySql();
    assert.equal(getThreadFromDb(sql, "0xabc", "1"), null);
  });

  it("saves a first-chat thread with several seed messages", () => {
    const db = applySchema(memorySql());
    const thread = sampleThread();
    setThreadFull(db, "0xabc", "1", thread);
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.ok(loaded);
    assert.equal(loaded.sceneId, "late-night");
    assert.equal(loaded.messages.length, 3);
    assert.deepEqual(
      loaded.messages.map((m) => m.id),
      ["meta-1", "user-1", "asst-1"],
    );
    assert.deepEqual(loaded.choicesByChapter[0], ["继续聊", "想你了"]);
  });

  it("round-trips thread locale and localized opening", () => {
    const db = applySchema(memorySql());
    setThreadFull(db, "0xabc", "1", {
      ...sampleThread(),
      locale: "en-US",
      localizedOpening: "hey",
      localizedHeading: "Late night",
    });
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.locale, "en-US");
    assert.equal(loaded?.localizedOpening, "hey");
    assert.equal(loaded?.localizedHeading, "Late night");
  });

  it("round-trips a voice note", () => {
    const db = applySchema(memorySql());
    const thread = sampleThread([
      {
        id: "voice-1",
        role: "assistant",
        content: "",
        chapter: 0,
        audioUrl: "data:audio/mpeg;base64,abc",
      },
    ]);
    setThreadFull(db, "0xabc", "1", thread);
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.messages.at(-1)?.audioUrl, "data:audio/mpeg;base64,abc");
  });

  it("keeps archived photos after the transcript is replaced", () => {
    const db = applySchema(memorySql());
    setThreadFull(db, "0xabc", "1", sampleThread([
      {
        id: "pic-1",
        role: "assistant",
        content: "",
        chapter: 0,
        imageUrl: "/api/media/keep-me",
      },
    ]));
    const seeded = getThreadFromDb(db, "0xabc", "1");
    assert.ok(seeded);
    setThreadFull(db, "0xabc", "1", {
      ...sampleThread(),
      usedImageIds: seeded.usedImageIds,
      photoUrls: seeded.photoUrls,
    });
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.messages.some((m) => m.imageUrl === "/api/media/keep-me"), false);
    assert.deepEqual(loaded?.photoUrls, ["/api/media/keep-me"]);
    assert.ok(loaded?.usedImageIds.includes("keep-me"));
  });

  it("ignores a stale full write after a newer reset generation", () => {
    const db = applySchema(memorySql());
    const oldThread = sampleThread([
      { id: "user-2", role: "user", content: "想你了", chapter: 0 },
      { id: "asst-2", role: "assistant", content: "我也想", chapter: 0 },
      {
        id: "pic-1",
        role: "assistant",
        content: "",
        chapter: 0,
        imageUrl: "/api/media/keep-me",
      },
    ]);
    setThreadFull(db, "0xabc", "1", oldThread);
    const reset = {
      ...sampleThread(),
      generation: 1,
      usedImageIds: ["keep-me"],
      photoUrls: ["/api/media/keep-me"],
    };
    setThreadFull(db, "0xabc", "1", reset);
    setThreadFull(db, "0xabc", "1", oldThread);
    appendMessages(
      db,
      "0xabc",
      "1",
      [{ id: "stale-user", role: "user", content: "想你了", chapter: 0 }],
      {
        chapter: 0,
        sceneId: "late-night",
        sceneImages: 0,
        choicesByChapter: { 0: ["继续聊"] },
        generation: 0,
      },
    );
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.generation, 1);
    assert.equal(loaded?.messages.some((m) => m.content === "想你了"), false);
    assert.deepEqual(loaded?.photoUrls, ["/api/media/keep-me"]);
  });

  it("appends the first user/assistant turn onto an empty-ish thread", () => {
    const db = applySchema(memorySql());
    setThreadFull(db, "0xabc", "1", sampleThread());
    appendMessages(
      db,
      "0xabc",
      "1",
      [
        { id: "user-2", role: "user", content: "想你了", chapter: 0 },
        { id: "asst-2", role: "assistant", content: "我也想", chapter: 0 },
      ],
      {
        chapter: 0,
        sceneId: "late-night",
        sceneImages: 0,
        choicesByChapter: { 0: ["再来"] },
      },
    );
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.messages.length, 5);
    assert.equal(loaded?.messages.at(-1)?.content, "我也想");
  });

  it("round-trips an in-thread send error bubble", () => {
    const db = applySchema(memorySql());
    setThreadFull(
      db,
      "0xabc",
      "1",
      sampleThread([
        { id: "user-2", role: "user", content: "想你了", chapter: 0 },
        {
          id: "err-1",
          role: "assistant",
          content: CHAT_SEND_ERROR_COPY,
          chapter: 0,
          error: true,
        },
      ]),
    );
    const loaded = getThreadFromDb(db, "0xabc", "1");
    assert.equal(loaded?.messages.at(-1)?.error, true);
    assert.equal(loaded?.messages.at(-1)?.content, CHAT_SEND_ERROR_COPY);
  });

  it("searches indexed message text when FTS is available", () => {
    const db = applySchema(memorySql());
    setThreadFull(db, "0xabc", "1", sampleThread());
    if (!db.fts) return;
    assert.deepEqual(ftsSearch(db, "0xabc", "1", "hey"), ["asst-1"]);
    assert.deepEqual(ftsSearch(db, "0xabc", "1", "nope"), []);
  });

  it("treats an older generation as a stale OPFS write", () => {
    resetThreadGenerationForTests();
    adoptThreadGeneration("0xabc", "1", 1);
    assert.equal(isStaleThreadGeneration("0xabc", "1", 0), true);
    assert.equal(isStaleThreadGeneration("0xabc", "1", 1), false);
    assert.equal(isStaleThreadGeneration("0xabc", "2", 0), false);
    resetThreadGenerationForTests();
  });
});
