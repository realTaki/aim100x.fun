import type { ChatMsg, ChatThread } from "@/lib/thread";
import {
  parseChoicesJson,
  usedImageIdsFromMessages,
  collectPhotoUrls,
  threadGeneration,
} from "@/lib/thread";
import type { ChatThreadMetaPatch } from "@/lib/chat-store/types";

/** Minimal SQL surface shared by the OPFS worker and node:sqlite tests. */
export type ChatSql = {
  exec(sql: string): void;
  all(sql: string, params?: unknown[]): Record<string, unknown>[];
  run(sql: string, params?: unknown[]): void;
};

export type ChatDb = ChatSql & { fts: boolean };

const TABLES = `
CREATE TABLE IF NOT EXISTS chat_threads (
  user_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  chapter INTEGER NOT NULL DEFAULT 0,
  scene_id TEXT NOT NULL DEFAULT '',
  scene_images INTEGER NOT NULL DEFAULT 0,
  choices_json TEXT NOT NULL DEFAULT '{}',
  used_image_ids_json TEXT NOT NULL DEFAULT '[]',
  photos_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id, token_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  ord INTEGER NOT NULL,
  image_url TEXT,
  image_pending INTEGER NOT NULL DEFAULT 0,
  voice_pending INTEGER NOT NULL DEFAULT 0,
  audio_url TEXT,
  image_content_rating TEXT,
  image_nsfw_unlocked INTEGER NOT NULL DEFAULT 0,
  error INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS chat_messages_thread_idx
  ON chat_messages (user_id, token_id, ord);
`;

const FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS chat_messages_fts USING fts5(
  message_id UNINDEXED,
  user_id UNINDEXED,
  token_id UNINDEXED,
  content,
  tokenize = 'unicode61'
);
`;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseStringList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string" || !item.trim() || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

function mergeStringList(a: string[], b: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...a, ...b]) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function rowToMsg(row: Record<string, unknown>): ChatMsg {
  const rating = asString(row.image_content_rating);
  return {
    id: asString(row.id),
    role: asString(row.role) as ChatMsg["role"],
    content: asString(row.content),
    chapter: asNumber(row.chapter),
    imageUrl: asString(row.image_url) || undefined,
    imageId: asString(row.image_id) || undefined,
    imagePaymentIntent: asString(row.image_payment_intent) || undefined,
    imagePaymentAmount: asString(row.image_payment_amount) || undefined,
    imagePending: asNumber(row.image_pending) ? true : undefined,
    voicePending: asNumber(row.voice_pending) ? true : undefined,
    audioUrl: asString(row.audio_url) || undefined,
    imageContentRating: rating === "NSFW" || rating === "SFW" ? rating : undefined,
    imageNsfwUnlocked: asNumber(row.image_nsfw_unlocked) ? true : undefined,
    error: asNumber(row.error) ? true : undefined,
  };
}

function indexMessage(db: ChatDb, userId: string, tokenKey: string, msg: ChatMsg) {
  if (!db.fts || !msg.content.trim()) return;
  db.run(
    `INSERT INTO chat_messages_fts (message_id, user_id, token_id, content)
     VALUES (?, ?, ?, ?)`,
    [msg.id, userId, tokenKey, msg.content],
  );
}

function clearFtsForThread(db: ChatDb, userId: string, tokenKey: string) {
  if (!db.fts) return;
  db.run(
    `DELETE FROM chat_messages_fts
     WHERE message_id IN (
       SELECT id FROM chat_messages WHERE user_id = ? AND token_id = ?
     )`,
    [userId, tokenKey],
  );
}

export function applySchema(sql: ChatSql): ChatDb {
  sql.exec(TABLES);
  for (const column of ["image_id", "image_payment_intent", "image_payment_amount"]) {
    try {
      sql.exec(`ALTER TABLE chat_messages ADD COLUMN ${column} TEXT`);
    } catch {
      /* already migrated */
    }
  }
  let fts = false;
  try {
    sql.exec(FTS);
    fts = true;
  } catch {
    /* search index is optional — first chat must still open */
  }
  try {
    sql.exec(`ALTER TABLE chat_messages ADD COLUMN image_content_rating TEXT`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_messages ADD COLUMN image_nsfw_unlocked INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_messages ADD COLUMN error INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_messages ADD COLUMN voice_pending INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_messages ADD COLUMN audio_url TEXT`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN used_image_ids_json TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN photos_json TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN locale TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN localized_opening TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN localized_heading TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* column exists */
  }
  try {
    sql.exec(`ALTER TABLE chat_threads ADD COLUMN generation INTEGER NOT NULL DEFAULT 0`);
  } catch {
    /* column exists */
  }
  return { ...sql, fts };
}

/** Empty OPFS / no rows is `null`, not an error. */
export function getThreadFromDb(db: ChatSql, userId: string, tokenKey: string): ChatThread | null {
  let metaRow: Record<string, unknown> | undefined;
  let rows: Record<string, unknown>[] = [];
  try {
    metaRow = db.all(
      `SELECT chapter, scene_id, scene_images, choices_json, used_image_ids_json, photos_json, locale, localized_opening, localized_heading, generation FROM chat_threads
       WHERE user_id = ? AND token_id = ?`,
      [userId, tokenKey],
    )[0];
    rows = db.all(
      `SELECT id, role, content, chapter, image_url, image_id, image_payment_intent, image_payment_amount, image_pending, voice_pending, audio_url, image_content_rating, image_nsfw_unlocked, error FROM chat_messages
       WHERE user_id = ? AND token_id = ?
       ORDER BY ord ASC`,
      [userId, tokenKey],
    );
  } catch {
    return null;
  }
  if (!metaRow && rows.length === 0) return null;
  const choicesByChapter = metaRow ? parseChoicesJson(asString(metaRow.choices_json, "{}")) : {};
  const chapter = metaRow ? asNumber(metaRow.chapter) : 0;
  const sceneId = asString(metaRow?.scene_id);
  const sceneImages = metaRow ? asNumber(metaRow.scene_images) : 0;
  const messages = rows.map(rowToMsg);
  return {
    chapter,
    sceneId,
    sceneImages,
    messages,
    choicesByChapter,
    usedImageIds: mergeStringList(
      parseStringList(metaRow?.used_image_ids_json),
      usedImageIdsFromMessages(messages),
    ),
    photoUrls: mergeStringList(
      parseStringList(metaRow?.photos_json),
      collectPhotoUrls({ messages, photoUrls: [] }),
    ),
    locale: asString(metaRow?.locale) || undefined,
    localizedOpening: asString(metaRow?.localized_opening) || undefined,
    localizedHeading: asString(metaRow?.localized_heading) || undefined,
    generation: asNumber(metaRow?.generation) || undefined,
  };
}

function upsertThreadMeta(
  db: ChatSql,
  userId: string,
  tokenKey: string,
  meta: {
    chapter: number;
    sceneId: string;
    sceneImages: number;
    choicesByChapter: Record<number, string[]>;
    usedImageIds?: readonly string[];
    photoUrls?: readonly string[];
    locale?: string;
    localizedOpening?: string;
    localizedHeading?: string;
    generation?: number;
  },
) {
  db.run(
    `INSERT INTO chat_threads (user_id, token_id, chapter, scene_id, scene_images, choices_json, used_image_ids_json, photos_json, locale, localized_opening, localized_heading, generation)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, token_id) DO UPDATE SET
       chapter = excluded.chapter,
       scene_id = excluded.scene_id,
       scene_images = excluded.scene_images,
       choices_json = excluded.choices_json,
       used_image_ids_json = excluded.used_image_ids_json,
       photos_json = excluded.photos_json,
       locale = excluded.locale,
       localized_opening = excluded.localized_opening,
       localized_heading = excluded.localized_heading,
       generation = excluded.generation`,
    [
      userId,
      tokenKey,
      meta.chapter,
      meta.sceneId,
      meta.sceneImages,
      JSON.stringify(meta.choicesByChapter),
      JSON.stringify(meta.usedImageIds ?? []),
      JSON.stringify(meta.photoUrls ?? []),
      meta.locale ?? "",
      meta.localizedOpening ?? "",
      meta.localizedHeading ?? "",
      threadGeneration({ generation: meta.generation }),
    ],
  );
}

function insertMessage(db: ChatDb, userId: string, tokenKey: string, msg: ChatMsg, ord: number) {
  db.run(
    `INSERT INTO chat_messages
     (id, user_id, token_id, role, content, chapter, ord, image_url, image_id, image_payment_intent, image_payment_amount, image_pending, voice_pending, audio_url, image_content_rating, image_nsfw_unlocked, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.id,
      userId,
      tokenKey,
      msg.role,
      msg.content,
      msg.chapter,
      ord,
      msg.imageUrl ?? null,
      msg.imageId ?? null,
      msg.imagePaymentIntent ?? null,
      msg.imagePaymentAmount ?? null,
      msg.imagePending ? 1 : 0,
      msg.voicePending ? 1 : 0,
      msg.audioUrl ?? null,
      msg.imageContentRating ?? null,
      msg.imageNsfwUnlocked ? 1 : 0,
      msg.error ? 1 : 0,
    ],
  );
  indexMessage(db, userId, tokenKey, msg);
}

export function setThreadFull(db: ChatDb, userId: string, tokenKey: string, thread: ChatThread) {
  const existing = getThreadFromDb(db, userId, tokenKey);
  if (threadGeneration(existing) > threadGeneration(thread)) return;
  db.exec("BEGIN");
  try {
    clearFtsForThread(db, userId, tokenKey);
    db.run(`DELETE FROM chat_messages WHERE user_id = ? AND token_id = ?`, [userId, tokenKey]);
    upsertThreadMeta(db, userId, tokenKey, {
      chapter: thread.chapter,
      sceneId: thread.sceneId,
      sceneImages: thread.sceneImages,
      choicesByChapter: thread.choicesByChapter,
      usedImageIds: thread.usedImageIds,
      photoUrls: collectPhotoUrls(thread),
      locale: thread.locale,
      localizedOpening: thread.localizedOpening,
      localizedHeading: thread.localizedHeading,
      generation: threadGeneration(thread),
    });
    let ord = 1;
    for (const m of thread.messages) {
      insertMessage(db, userId, tokenKey, m, ord);
      ord += 1;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function appendMessages(
  db: ChatDb,
  userId: string,
  tokenKey: string,
  messages: ChatMsg[],
  meta: ChatThreadMetaPatch,
) {
  const maxRow = db.all(
    `SELECT max(ord) as n FROM chat_messages WHERE user_id = ? AND token_id = ?`,
    [userId, tokenKey],
  )[0];
  let ord = asNumber(maxRow?.n) + 1;
  const existing = getThreadFromDb(db, userId, tokenKey);
  if (threadGeneration(existing) > threadGeneration({ generation: meta.generation })) return;
  const photos = mergeStringList(
    existing?.photoUrls ?? [],
    collectPhotoUrls({ messages, photoUrls: meta.photoUrls }),
  );
  const used = mergeStringList(
    existing?.usedImageIds ?? [],
    meta.usedImageIds ?? usedImageIdsFromMessages(messages),
  );

  db.exec("BEGIN");
  try {
    upsertThreadMeta(db, userId, tokenKey, {
      ...meta,
      usedImageIds: used,
      photoUrls: photos,
      locale: meta.locale ?? existing?.locale,
      localizedOpening: meta.localizedOpening ?? existing?.localizedOpening,
      localizedHeading: meta.localizedHeading ?? existing?.localizedHeading,
      generation: Math.max(
        threadGeneration(existing),
        threadGeneration({ generation: meta.generation }),
      ),
    });
    for (const m of messages) {
      insertMessage(db, userId, tokenKey, m, ord);
      ord += 1;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function ftsSearch(db: ChatDb, userId: string, tokenKey: string, query: string): string[] {
  if (!db.fts) return [];
  const term = query.trim();
  if (!term) return [];
  const escaped = term.replace(/"/g, '""');
  const match = `"${escaped}"*`;
  try {
    const rows = db.all(
      `SELECT message_id FROM chat_messages_fts
       WHERE chat_messages_fts MATCH ?
         AND user_id = ?
         AND token_id = ?
       ORDER BY rank`,
      [match, userId, tokenKey],
    );
    return rows.map((r) => asString(r.message_id)).filter(Boolean);
  } catch {
    return [];
  }
}
