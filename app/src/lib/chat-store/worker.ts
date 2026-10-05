/// <reference lib="webworker" />
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Database } from "@sqlite.org/sqlite-wasm";
import {
  appendMessages,
  applySchema,
  ftsSearch,
  getThreadFromDb,
  setThreadFull,
  type ChatDb,
  type ChatSql,
} from "@/lib/chat-store/sql";
import type { ChatStoreRequest, ChatStoreResponse } from "@/lib/chat-store/types";

let chatDb: ChatDb | null = null;

function reply(res: ChatStoreResponse) {
  postMessage(res);
}

function wasmSql(database: Database): ChatSql {
  return {
    exec(sql) {
      database.exec(sql);
    },
    all(sql, params = []) {
      return database.selectObjects(sql, params as []) as Record<string, unknown>[];
    },
    run(sql, params = []) {
      const stmt = database.prepare(sql);
      try {
        if (params.length) stmt.bind(params as []);
        stmt.stepReset();
      } finally {
        stmt.finalize();
      }
    },
  };
}

async function openDb(): Promise<ChatDb> {
  if (chatDb) return chatDb;
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({
    directory: "/lonelyfuns-chat-opfs",
    name: "lf-chat-pool",
    initialCapacity: 8,
  });
  if (!pool || typeof pool.OpfsSAHPoolDb !== "function") {
    throw new Error("OPFS SAH pool unavailable");
  }
  const database = new pool.OpfsSAHPoolDb("lonelyfuns-chat-tokenid.db");
  chatDb = applySchema(wasmSql(database));
  return chatDb;
}

async function handle(req: ChatStoreRequest) {
  try {
    const database = await openDb();
    switch (req.type) {
      case "init": {
        reply({ id: req.id, ok: true });
        return;
      }
      case "getThread": {
        const thread = getThreadFromDb(database, req.userId, req.tokenKey);
        reply({ id: req.id, ok: true, thread });
        return;
      }
      case "setThread": {
        setThreadFull(database, req.userId, req.tokenKey, req.thread);
        reply({ id: req.id, ok: true });
        return;
      }
      case "appendMessages": {
        appendMessages(database, req.userId, req.tokenKey, req.messages, req.meta);
        reply({ id: req.id, ok: true });
        return;
      }
      case "search": {
        const messageIds = ftsSearch(database, req.userId, req.tokenKey, req.query);
        reply({ id: req.id, ok: true, messageIds });
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    reply({ id: req.id, ok: false, error: message });
  }
}

let handleChain: Promise<void> = Promise.resolve();

addEventListener("message", (ev: MessageEvent<ChatStoreRequest>) => {
  handleChain = handleChain.then(
    () => handle(ev.data),
    () => handle(ev.data),
  );
});
