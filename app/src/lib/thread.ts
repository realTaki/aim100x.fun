import {
  sceneChoices,
  sceneId as sceneIdFromFields,
  sceneOpening,
  sceneTopic,
  idolWelcome,
  type FlexibleScene,
} from "@/lib/idol-fields";
import { type Idol, sceneOf } from "@/lib/idols";
import { uid } from "@/lib/utils";
import { imageIdFromUrl } from "@/lib/library-rows";
import { normalizeMediaId } from "@/lib/media-app-id";
import { localesMatch } from "@/lib/locale";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "meta";
  content: string;
  chapter: number;
  imageUrl?: string;
  imageContentRating?: "SFW" | "NSFW";
  imagePending?: boolean;
  voicePending?: boolean;
  /** data:audio/mpeg;base64,... voice note in this thread. */
  audioUrl?: string;
  /** NSFW paid in chat; persisted in local OPFS. */
  imageNsfwUnlocked?: boolean;
  /** Send/network failure shown in-thread, not as an idol reply. */
  error?: boolean;
};

export type ChatThread = {
  chapter: number;
  sceneId: string;
  sceneImages: number;
  messages: ChatMsg[];
  choicesByChapter: Record<number, string[]>;
  /** Image page ids already shown in this thread (OPFS-backed). */
  usedImageIds: string[];
  /** Chat photos kept after the transcript is cleared. */
  photoUrls?: string[];
  /** Locale the opening was rewritten into. */
  locale?: string;
  localizedOpening?: string;
  localizedHeading?: string;
  /** Bumped on history reset so a stale in-memory persist cannot restore the old transcript. */
  generation?: number;
};

/** First-turn / idle shortcut chips when a scene has no `choices`. */
export const DEFAULT_SHORTCUT_CHOICES = ["继续聊", "想你了"] as const;

const CANNED_SHORTCUT_PAIRS: readonly (readonly string[])[] = [
  DEFAULT_SHORTCUT_CHOICES,
  ["继续聊", "再说说"],
  ["继续聊", "换个话题"],
  ["Keep going", "Miss you"],
  ["Go on", "Really?"],
  ["Keep going", "Change topic"],
];

export function shortcutChoicesForIdol(idol: Idol, chapter = 0): string[] {
  const seeded = sceneChoices(sceneOf(idol, chapter)).filter((c) => c.trim().length > 0);
  return seeded.length > 0 ? seeded : [...DEFAULT_SHORTCUT_CHOICES];
}

export function isCannedShortcutChoices(choices: string[]): boolean {
  if (choices.length < 2) return true;
  return CANNED_SHORTCUT_PAIRS.some(
    (pair) => pair.length === choices.length && pair.every((c, i) => c === choices[i]),
  );
}

/** Scene JSON / generic fallback — not a model-written pair for this moment. */
export function needsGeneratedShortcutChoices(
  idol: Idol,
  chapter: number,
  choices: string[],
): boolean {
  if (isCannedShortcutChoices(choices)) return true;
  const seed = sceneChoices(sceneOf(idol, chapter)).filter((c) => c.trim().length > 0);
  return (
    seed.length > 0 &&
    seed.length === choices.length &&
    seed.every((c, i) => c === choices[i])
  );
}

export function threadChoices(thread: ChatThread, chapter = thread.chapter): string[] {
  return (thread.choicesByChapter[chapter] ?? []).filter((c) => c.trim().length > 0);
}

/** Last spoken turn — ignore pending/image-only bubbles so chip gen is not discarded. */
export function chipTurnKey(thread: ChatThread): string {
  const last = [...thread.messages].reverse().find(
    (m) =>
      (m.role === "user" || m.role === "assistant") &&
      !m.imagePending &&
      !m.voicePending &&
      !m.imageUrl &&
      Boolean(m.content.trim()) &&
      !m.error,
  );
  return `${thread.chapter}:${last?.id ?? "none"}`;
}

/** Fill missing/empty current-chapter chips. Does not run during an in-flight send. */
export function withShortcutChoices(idol: Idol, thread: ChatThread): ChatThread {
  if (threadChoices(thread).length > 0) return thread;
  return {
    ...thread,
    choicesByChapter: {
      ...thread.choicesByChapter,
      [thread.chapter]: shortcutChoicesForIdol(idol, thread.chapter),
    },
  };
}

export function isChapterMeta(msg: ChatMsg) {
  return msg.role === "meta" && /^第\s*\d+/.test(msg.content);
}

export function isChatError(msg: ChatMsg) {
  return msg.error === true;
}

function scenePhotos(idol: Idol, ch: FlexibleScene): string[] {
  const sid = sceneIdFromFields(ch);
  return idol.scenePhotoUrls[sid] ?? [];
}

/** Drop leftover seedUser bubbles that sit before the idol opening. */
export function withoutSeededUserMessages(messages: ChatMsg[]): ChatMsg[] {
  const firstAssistant = messages.findIndex((m) => m.role === "assistant");
  if (firstAssistant < 0) return messages;
  return messages.filter((m, i) => m.role !== "user" || i >= firstAssistant);
}

export function seedChapter(idol: Idol, index: number): ChatMsg[] {
  const ch = sceneOf(idol, index);
  const welcome = index === 0 ? idolWelcome(idol) : "";
  const hasScene = Object.keys(ch).length > 0;
  if (!hasScene && !welcome) return [];
  const messages: ChatMsg[] = [];
  const heading = sceneTopic(ch);
  if (index === 0 && heading) {
    messages.push({
      id: uid(),
      role: "meta",
      content: heading,
      chapter: index,
    });
  }
  const opening = sceneOpening(ch);
  if (welcome && welcome !== opening) {
    messages.push({
      id: uid(),
      role: "assistant",
      content: welcome,
      chapter: index,
    });
  }
  if (hasScene) {
    const photos = scenePhotos(idol, ch);
    messages.push({
      id: uid(),
      role: "assistant",
      content: opening,
      chapter: index,
      imageUrl: index > 0 ? (photos[0] ?? idol.covers[0] ?? idol.photos[0]) : undefined,
    });
  }
  return messages;
}

export function emptyThread(idol: Idol): ChatThread {
  const ch = sceneOf(idol, 0);
  const messages = seedChapter(idol, 0);
  return {
    chapter: 0,
    sceneId: sceneIdFromFields(ch),
    sceneImages: messages.filter((m) => m.imageUrl).length,
    messages,
    choicesByChapter: { 0: [] },
    usedImageIds: [],
    photoUrls: [],
  };
}

export function withLocalizedSeed(
  thread: ChatThread,
  locale: string,
  opening: string,
  heading?: string,
  welcome?: string,
): ChatThread {
  const text = opening.trim();
  const welcomeText = welcome?.trim() ?? "";
  if (!text && !welcomeText) return { ...thread, locale };
  const assistantCount = thread.messages.filter(
    (m) => m.role === "assistant" && m.content.trim(),
  ).length;
  let metaDone = false;
  let skipWelcomeBubble = assistantCount >= 2 && !welcomeText;
  let welcomeDone = !welcomeText;
  let openDone = !text;
  const messages = thread.messages.map((m) => {
    if (!metaDone && m.role === "meta") {
      metaDone = true;
      return heading?.trim() ? { ...m, content: heading.trim() } : m;
    }
    if (m.role !== "assistant") return m;
    if (skipWelcomeBubble) {
      skipWelcomeBubble = false;
      return m;
    }
    if (!welcomeDone) {
      welcomeDone = true;
      return { ...m, content: welcomeText };
    }
    if (!openDone) {
      openDone = true;
      return { ...m, content: text };
    }
    return m;
  });
  return {
    ...thread,
    locale,
    localizedOpening: text || thread.localizedOpening,
    localizedHeading: heading?.trim() || thread.localizedHeading,
    messages,
  };
}

export function threadNeedsLocalizedOpening(thread: ChatThread, locale: string): boolean {
  const tag = locale.trim();
  if (!tag) return false;
  if (!thread.locale || !localesMatch(thread.locale, tag)) return true;
  return !thread.localizedOpening?.trim();
}

export function threadOpeningTexts(thread: ChatThread): {
  welcome?: string;
  opening: string;
  heading?: string;
} {
  const heading = thread.messages.find((m) => m.role === "meta" && m.content.trim())?.content;
  const assistants = thread.messages
    .filter((m) => m.role === "assistant" && m.content.trim())
    .map((m) => m.content);
  if (assistants.length >= 2) {
    return { heading, welcome: assistants[0], opening: assistants[1] ?? "" };
  }
  return { heading, opening: assistants[0] ?? "" };
}

export function threadGeneration(thread?: { generation?: number } | null): number {
  const n = thread?.generation;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Fresh creator-typed 欢迎词 then opening; keep seen photos so the gallery and catalog stay. */
export function restartChatThread(idol: Idol, thread: ChatThread): ChatThread {
  return {
    ...emptyThread(idol),
    usedImageIds: seenImageIds(thread),
    photoUrls: collectPhotoUrls(thread),
    generation: threadGeneration(thread) + 1,
  };
}

/** Missing OPFS/history is an empty thread, never a load failure. */
export function threadFromLocalHistory(idol: Idol, existing: ChatThread | null): ChatThread {
  if (!existing) return emptyThread(idol);
  const messages = withoutSeededUserMessages(existing.messages);
  const thread =
    messages.length === existing.messages.length ? existing : { ...existing, messages };
  return withDedupedUserTurns(withUsedImageIds(thread));
}

export function withOptimisticUserMessage(
  thread: ChatThread,
  content: string,
  id: string,
): ChatThread {
  const text = content.trim();
  return {
    ...thread,
    messages: [
      ...thread.messages,
      { id, role: "user", content: text, chapter: thread.chapter },
    ],
    choicesByChapter: { ...thread.choicesByChapter, [thread.chapter]: [] },
  };
}

/** Drop a consecutive duplicate user send (optimistic + server id). */
export function withoutDuplicateUserTurns(messages: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const m of messages) {
    const prev = out.at(-1);
    if (
      prev &&
      prev.role === "user" &&
      m.role === "user" &&
      prev.content.trim() === m.content.trim() &&
      !prev.imageUrl &&
      !m.imageUrl &&
      !prev.audioUrl &&
      !m.audioUrl &&
      !prev.error &&
      !m.error
    ) {
      continue;
    }
    out.push(m);
  }
  return out;
}

function withDedupedUserTurns(thread: ChatThread): ChatThread {
  const messages = withoutDuplicateUserTurns(thread.messages);
  return messages.length === thread.messages.length ? thread : { ...thread, messages };
}

/** Never drop an optimistic send and restore the unsent thread. */
export function keepSentThread(
  optimistic: ChatThread,
  next?: ChatThread | null,
): ChatThread {
  if (!next) return withDedupedUserTurns(optimistic);
  const sent = [...optimistic.messages].reverse().find((m) => m.role === "user");
  if (!sent) return withDedupedUserTurns(next);
  const kept = next.messages.some(
    (m) => m.role === "user" && (m.id === sent.id || m.content === sent.content),
  );
  return withDedupedUserTurns(kept ? next : optimistic);
}

/**
 * A refetch / remount must not rewind the thread the user is looking at, or
 * drop an in-thread send-error bubble that OPFS has not caught up with yet.
 */
export function preferLiveThread(
  current: ChatThread | null | undefined,
  incoming: ChatThread,
): ChatThread {
  const next = withDedupedUserTurns(incoming);
  if (!current) return next;
  const live = withDedupedUserTurns(current);
  const liveGen = threadGeneration(live);
  const nextGen = threadGeneration(next);
  if (nextGen > liveGen) return next;
  if (liveGen > nextGen) return live;
  if (live.messages.length > next.messages.length) {
    return mergeThreadMedia(live, next);
  }
  if (live.messages.length < next.messages.length) {
    return mergeThreadMedia(next, live);
  }
  const currentErrors = live.messages.filter((m) => m.error).length;
  const incomingErrors = next.messages.filter((m) => m.error).length;
  const primary = currentErrors > incomingErrors ? live : next;
  const secondary = primary === live ? next : live;
  return mergeThreadMedia(primary, secondary);
}

function mergeThreadMedia(primary: ChatThread, secondary: ChatThread): ChatThread {
  const extras = new Map(secondary.messages.map((m) => [m.id, m]));
  return {
    ...primary,
    messages: primary.messages.map((m) => {
      const other = extras.get(m.id);
      if (!other) return m;
      const audioUrl = m.audioUrl || other.audioUrl;
      const imageUrl = m.imageUrl || other.imageUrl;
      return {
        ...m,
        audioUrl,
        imageUrl,
        voicePending: audioUrl ? undefined : m.voicePending || other.voicePending,
        imagePending: imageUrl ? undefined : m.imagePending || other.imagePending,
      };
    }),
  };
}

export async function readLocalHistoryOrNull(
  read: () => Promise<ChatThread | null>,
): Promise<ChatThread | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Image page ids already attached in this thread (OPFS). */
export function usedImageIdsFromMessages(messages: ChatMsg[]): string[] {
  const ids: string[] = [];
  for (const m of messages) {
    if (!m.imageUrl) continue;
    const id = imageIdFromUrl(m.imageUrl);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Client-seen photo ids for this thread (stored list + bubbles). */
export function seenImageIds(thread: {
  usedImageIds?: readonly string[];
  messages: ChatMsg[];
}): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(thread.usedImageIds ?? []), ...usedImageIdsFromMessages(thread.messages)]) {
    const key = normalizeMediaId(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ids.push(key);
  }
  return ids;
}

export function rememberUsedImageId(thread: ChatThread, imageId?: string): ChatThread {
  if (!imageId?.trim()) return thread;
  const ids = seenImageIds(thread);
  const key = normalizeMediaId(imageId);
  if (ids.includes(key)) return { ...thread, usedImageIds: ids };
  return { ...thread, usedImageIds: [...ids, key] };
}

export function withUsedImageIds(thread: ChatThread): ChatThread {
  const ids = seenImageIds(thread);
  const photos = collectPhotoUrls(thread);
  return {
    ...thread,
    usedImageIds: ids.length > 0 ? ids : thread.usedImageIds ?? [],
    photoUrls: photos,
  };
}

export function collectPhotoUrls(thread: {
  photoUrls?: readonly string[];
  messages: ChatMsg[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const src of [
    ...(thread.photoUrls ?? []),
    ...thread.messages.map((m) => m.imageUrl).filter((u): u is string => Boolean(u)),
  ]) {
    if (seen.has(src)) continue;
    seen.add(src);
    out.push(src);
  }
  return out;
}

export function parseChoicesJson(raw: string): Record<number, string[]> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<number, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(k);
      if (!Number.isFinite(n) || !Array.isArray(v)) continue;
      out[n] = v.filter((c): c is string => typeof c === "string");
    }
    return out;
  } catch {
    return {};
  }
}

export function isVoiceOnlyMessage(msg: ChatMsg): boolean {
  return Boolean((msg.audioUrl || msg.voicePending) && !msg.content.trim() && !msg.imageUrl);
}

/** Fold a trailing voice-only bubble into the previous assistant text. */
export function foldVoiceIntoText(messages: ChatMsg[]): ChatMsg[] {
  const out: ChatMsg[] = [];
  for (const msg of messages) {
    const prev = out.at(-1);
    if (
      isVoiceOnlyMessage(msg) &&
      prev?.role === "assistant" &&
      prev.content.trim() &&
      !prev.imageUrl
    ) {
      out[out.length - 1] = {
        ...prev,
        audioUrl: msg.audioUrl ?? prev.audioUrl,
        voicePending:
          msg.audioUrl || prev.audioUrl
            ? undefined
            : msg.voicePending || prev.voicePending || undefined,
      };
      continue;
    }
    out.push(msg);
  }
  return out;
}

