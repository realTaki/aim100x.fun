import type { Idol } from "@/lib/idols";
import type { AppUser } from "@/lib/auth/use-current-user";
import { imageIdFromUrl } from "@/lib/library-rows";
import { recoverDanglingSend, withSendErrorBubble } from "@/lib/chat-fallback";
import {
  keepSentThread,
  needsGeneratedShortcutChoices,
  readLocalHistoryOrNull,
  restartChatThread,
  seenImageIds,
  emptyThread,
  threadChoices,
  threadFromLocalHistory,
  threadGeneration,
  threadNeedsLocalizedOpening,
  threadOpeningTexts,
  withLocalizedSeed,
  withOptimisticUserMessage,
  withUsedImageIds,
  type ChatMsg,
  type ChatThread,
} from "@/lib/thread";
import { chatSessionKey, endChatSend, getChatSendSnapshot, peekLiveThread, publishLiveThread } from "@/lib/chat-send-lock";
import { isUnauthorized } from "@/lib/utils";
import { hobbyServerFnFetch } from "@/lib/chat-hobby";
import {
  appendLocalMessages,
  loadLocalThread,
  saveLocalThread,
  searchLocalMessages,
} from "@/lib/chat-store/client";
import {
  localChatUserId,
  localChatUserIdLookupKeys,
} from "@/lib/chat-store/user-key";
import { adoptThreadGeneration } from "@/lib/chat-store/generation";
import {
  attachChatImage as attachChatImageServer,
  bootstrapThreadChoices,
  generateNewPhotos as generateNewPhotosServer,
  sendChat as sendChatServer,
} from "@/lib/data";
import { uid } from "@/lib/utils";
import { clipModelHistory } from "@/lib/chat-reply";
import { resolveConnectedWallet } from "@/lib/subscribe/connected-wallet";
import { isFanOfTokenId } from "@/lib/subscribe/fan-status-client";
import { readUserProfileAlongKeys } from "@/lib/user-profile/local";
import { passkeyRecordForAddress } from "@/lib/auth/passkey-record";
import { readBrowserLocale } from "@/lib/locale";
import { localizeOpening } from "@/lib/ai";
import { idolName } from "@/lib/idol-fields";

function localeForUser(user: AppUser): string {
  const stored = readUserProfileAlongKeys(localChatUserIdLookupKeys(user)).profile.locale.trim();
  return stored || readBrowserLocale();
}

function fanPromptProfile(user: AppUser): { username?: string; bio?: string; locale?: string } {
  const profile = readUserProfileAlongKeys(localChatUserIdLookupKeys(user)).profile;
  const username =
    profile.username.trim() || passkeyRecordForAddress(user.id)?.username?.trim() || "";
  const bio = profile.bio.trim();
  return {
    username: username || undefined,
    bio: bio || undefined,
    locale: localeForUser(user) || undefined,
  };
}

/** Prefer language rewrites 欢迎词 + opening at subscribe/init only. */
async function localizeThreadOpening(
  thread: ChatThread,
  idol: Idol,
  locale: string,
): Promise<ChatThread> {
  if (!locale || !threadNeedsLocalizedOpening(thread, locale)) return thread;
  const texts = threadOpeningTexts(thread);
  if (!texts.opening.trim() && !texts.welcome?.trim()) return { ...thread, locale };
  try {
    const result = await localizeOpening({
      data: {
        opening: texts.opening,
        heading: texts.heading,
        welcome: texts.welcome,
        locale,
        idolName: idolName(idol),
      },
    });
    if (!result.ok) return { ...thread, locale };
    return withLocalizedSeed(thread, locale, result.opening, result.heading, result.welcome);
  } catch {
    return { ...thread, locale };
  }
}

function chatSendErrorCopy(error?: string): string {
  if (error === "ai_not_configured") {
    return "Chat isn't configured (missing MINIMAX_CN_API_KEY)";
  }
  if (error === "ai_timeout") return "Chat timed out. Try again.";
  if (error === "ai_request_failed") return "Chat didn't respond. Try again.";
  if (error && error !== "not_fan") {
    return `Chat failed — screenshot this\n${error.slice(0, 180)}`;
  }
  return "Couldn't send. Try again.";
}

async function loadLocalThreadForUser(
  user: AppUser,
  tokenKey: string,
): Promise<{ storageUserId: string; thread: ChatThread | null }> {
  const keys = localChatUserIdLookupKeys(user);
  const storageUserId = keys[0];
  for (const key of keys) {
    const loaded = await readLocalHistoryOrNull(() => loadLocalThread(key, tokenKey));
    if (loaded) {
      const thread = withUsedImageIds(loaded);
      if (key !== storageUserId) {
        await saveLocalThread(storageUserId, tokenKey, thread);
      }
      return { storageUserId, thread };
    }
  }
  return { storageUserId, thread: null };
}

export async function persistChatThread(
  user: AppUser,
  tokenId: number,
  thread: ChatThread,
): Promise<void> {
  const storageUserId = localChatUserId(user);
  await saveLocalThread(storageUserId, String(tokenId), withUsedImageIds(thread));
}

/** After subscribe: create the idol OPFS thread with 欢迎词 then scene opening. */
export async function persistNewSubscriberThread(
  user: AppUser,
  idol: Idol,
): Promise<void> {
  const tokenKey = String(idol.tokenId);
  const loaded = await loadLocalThreadForUser(user, tokenKey);
  if (loaded.thread) return;
  const seeded = await localizeThreadOpening(emptyThread(idol), idol, localeForUser(user));
  await saveLocalThread(loaded.storageUserId, tokenKey, withUsedImageIds(seeded));
}

export async function restartChatForUser(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
): Promise<ChatThread> {
  const sessionKey = chatSessionKey(user.id, idol.tokenId);
  const storageUserId = localChatUserId(user);
  const tokenKey = String(idol.tokenId);
  endChatSend(sessionKey);
  const next = restartChatThread(idol, thread);
  adoptThreadGeneration(storageUserId, tokenKey, next.generation);
  publishLiveThread(sessionKey, next);
  await persistChatThread(user, idol.tokenId, next);
  const localized = await localizeThreadOpening(next, idol, localeForUser(user));
  if (threadGeneration(peekLiveThread(sessionKey)) !== threadGeneration(next)) {
    return peekLiveThread(sessionKey) ?? localized;
  }
  if (localized !== next) {
    publishLiveThread(sessionKey, localized);
    await persistChatThread(user, idol.tokenId, localized);
  }
  return localized;
}

async function generateLiveChoices(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
): Promise<string[]> {
  const fanWallet = await resolveConnectedWallet(user);
  const live = await bootstrapThreadChoices({
    data: {
      tokenId: idol.tokenId,
      chapter: thread.chapter,
      lastChoices: threadChoices(thread),
      fanWallet: fanWallet ?? undefined,
      fan: fanPromptProfile(user),
      messages: thread.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => !m.error && m.content.trim())
        .slice(-12)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    },
  });
  return live.ok && live.choices.length >= 2 ? live.choices : [];
}

export async function refreshThreadChoices(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
): Promise<ChatThread> {
  if (!needsGeneratedShortcutChoices(idol, thread.chapter, threadChoices(thread))) {
    return thread;
  }
  try {
    const choices = await generateLiveChoices(user, idol, thread);
    if (choices.length < 2) return thread;
    const next = {
      ...thread,
      choicesByChapter: { ...thread.choicesByChapter, [thread.chapter]: choices },
    };
    await persistChatThread(user, idol.tokenId, next);
    return next;
  } catch {
    return thread;
  }
}

export async function getThreadForUser(
  user: AppUser,
  idol: Idol,
): Promise<{ ok: true; thread: ChatThread } | { ok: false; reason: "not_fan" }> {
  if (!user.isDevFallback) {
    const wallet = await resolveConnectedWallet(user);
    if (!(await isFanOfTokenId(idol.tokenId, wallet))) return { ok: false, reason: "not_fan" };
  }

  const tokenKey = String(idol.tokenId);
  let storageUserId = localChatUserId(user);
  let existing: ChatThread | null = null;
  try {
    const loaded = await loadLocalThreadForUser(user, tokenKey);
    storageUserId = loaded.storageUserId;
    existing = loaded.thread;
  } catch {
    existing = null;
  }

  let thread = threadFromLocalHistory(idol, existing);
  if (!existing) {
    thread = await localizeThreadOpening(thread, idol, localeForUser(user));
  }
  if (needsGeneratedShortcutChoices(idol, thread.chapter, threadChoices(thread))) {
    thread = {
      ...thread,
      choicesByChapter: { ...thread.choicesByChapter, [thread.chapter]: [] },
    };
  }

  const sessionKey = chatSessionKey(user.id, idol.tokenId);
  const live = peekLiveThread(sessionKey);
  if (threadGeneration(live) > threadGeneration(thread)) {
    return { ok: true, thread: live! };
  }
  const inFlight = Boolean(getChatSendSnapshot(sessionKey));
  thread = recoverDanglingSend(thread, inFlight);
  if (inFlight) return { ok: true, thread };

  const existingHadChips = existing != null && threadChoices(existing).length > 0;
  const danglingFixed =
    Boolean(existing) &&
    thread.messages.some((m) => m.error) &&
    !existing!.messages.some((m) => m.error);
  const droppedSeed =
    existing != null && existing.messages.length !== thread.messages.length;
  const chipsChanged =
    threadChoices(thread).join("\0") !== threadChoices(existing ?? { choicesByChapter: {}, chapter: thread.chapter } as ChatThread).join("\0");
  if (!existing || !existingHadChips || danglingFixed || chipsChanged || droppedSeed) {
    await saveLocalThread(storageUserId, tokenKey, thread);
  }
  return { ok: true, thread };
}

export async function sendChatForUser(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
  content: string,
  opts?: { fanSentVoice?: boolean },
): Promise<
  | {
      ok: true;
      userMessage: ChatMsg;
      reply: string;
      assistantMessage: ChatMsg;
      choices: string[];
      wantImage: boolean;
      imageId?: string;
      wantVoice?: boolean;
      voiceText?: string;
      generatePhotos?: boolean;
      photoPrompt?: string;
      photoTags?: string;
      fallback?: boolean;
      thread: ChatThread;
    }
  | { ok: false; error: string; thread: ChatThread }
> {
  const storageUserId = localChatUserId(user);
  const sessionKey = chatSessionKey(user.id, idol.tokenId);
  const fanWallet = await resolveConnectedWallet(user);
  const optimistic = withOptimisticUserMessage(thread, content, uid());
  publishLiveThread(sessionKey, optimistic);

  const finishLocally = async (detail?: string) => {
    const kept = keepSentThread(
      optimistic,
      withSendErrorBubble(
        optimistic,
        detail
          ? `Chat failed — screenshot this\n${detail.slice(0, 180)}`
          : "Chat didn't respond. Try again.",
      ),
    );
    publishLiveThread(sessionKey, kept);
    await saveLocalThread(storageUserId, String(idol.tokenId), kept);
    return {
      ok: true as const,
      userMessage: kept.messages.find((m) => m.role === "user" && m.content === content.trim()) ?? optimistic.messages.at(-1)!,
      reply: kept.messages.find((m) => m.error)?.content ?? "",
      assistantMessage: kept.messages.find((m) => m.error)!,
      choices: kept.choicesByChapter[kept.chapter] ?? [],
      wantImage: false as const,
      fallback: true as const,
      thread: kept,
    };
  };

  let result: Awaited<ReturnType<typeof sendChatServer>>;
  try {
    result = await sendChatServer({
      data: {
        tokenId: idol.tokenId,
        content,
        fanWallet: fanWallet ?? undefined,
        fanSentVoice: Boolean(opts?.fanSentVoice),
        fan: fanPromptProfile(user),
        thread: {
          chapter: thread.chapter,
          sceneId: thread.sceneId,
          sceneImages: thread.sceneImages,
          messages: clipModelHistory(thread.messages).map((m, i) => ({
            id: `ctx-${i}`,
            role: m.role,
            content: m.content,
            chapter: thread.chapter,
          })),
          choicesByChapter: thread.choicesByChapter,
          usedImageIds: seenImageIds(thread),
        },
      },
      fetch: hobbyServerFnFetch,
    });
  } catch (err) {
    if (isUnauthorized(err)) throw err;
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : "network";
    return finishLocally(detail);
  }
  if (!result || typeof result !== "object" || !("ok" in result)) {
    return finishLocally();
  }
  if (!result.ok) {
    if (result.error === "not_fan") {
      const kept = keepSentThread(
        optimistic,
        withSendErrorBubble(optimistic, "Subscribe first — message didn't send"),
      );
      publishLiveThread(sessionKey, kept);
      await saveLocalThread(storageUserId, String(idol.tokenId), kept);
      return { ok: false, error: result.error, thread: kept };
    }
    const kept = keepSentThread(
      optimistic,
      withSendErrorBubble(optimistic, chatSendErrorCopy(result.error)),
    );
    publishLiveThread(sessionKey, kept);
    await saveLocalThread(storageUserId, String(idol.tokenId), kept);
    return { ok: false, error: result.error, thread: kept };
  }

  const assistantMessage = result.assistantMessage;
  const nextChoices = needsGeneratedShortcutChoices(idol, result.chapter, result.choices)
    ? []
    : result.choices;
  const choicesByChapter = {
    ...thread.choicesByChapter,
    [result.chapter]: nextChoices,
  };
  const meta = {
    chapter: result.chapter,
    sceneId: result.sceneId,
    sceneImages: result.sceneImages,
    choicesByChapter,
  };
  const baseMessages = [...thread.messages, result.userMessage];
  const messages = assistantMessage.content.trim()
    ? [...baseMessages, assistantMessage]
    : baseMessages;
  const updatedThread: ChatThread = {
    ...thread,
    ...meta,
    messages,
  };
  const kept = keepSentThread(optimistic, updatedThread);
  await saveLocalThread(storageUserId, String(idol.tokenId), withUsedImageIds(kept));
  publishLiveThread(sessionKey, kept);
  return {
    ...result,
    assistantMessage,
    reply: assistantMessage.content,
    wantImage: result.wantImage,
    wantVoice: result.wantVoice,
    voiceText: result.voiceText,
    generatePhotos: result.generatePhotos,
    photoPrompt: result.photoPrompt,
    photoTags: result.photoTags,
    thread: kept,
  };
}

export async function attachChatImageForUser(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
  input: { reply: string; chapter: number; imageId?: string },
): Promise<{ ok: true; imageMessage?: ChatMsg; thread: ChatThread } | { ok: false; error: string }> {
  const storageUserId = localChatUserId(user);
  const history = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => !m.error && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const threadImageIds = thread.messages
    .map((m) => (m.imageUrl ? imageIdFromUrl(m.imageUrl) : undefined))
    .filter((id): id is string => Boolean(id));

  const fanWallet = await resolveConnectedWallet(user);
  const result = await attachChatImageServer({
    data: {
      tokenId: idol.tokenId,
      reply: input.reply,
      chapter: input.chapter,
      sceneId: thread.sceneId,
      sceneImages: thread.sceneImages,
      history,
      threadImageIds,
      fanWallet: fanWallet ?? undefined,
      usedImageIds: seenImageIds(thread),
      imageId: input.imageId,
    },
  });
  if (!result.ok) return result;

  if (!result.imageMessage) {
    return {
      ok: true,
      thread: { ...thread, sceneId: result.sceneId, sceneImages: result.sceneImages },
    };
  }

  const meta = {
    chapter: thread.chapter,
    sceneId: result.sceneId,
    sceneImages: result.sceneImages,
    choicesByChapter: thread.choicesByChapter,
    generation: thread.generation,
  };
  await appendLocalMessages(storageUserId, String(idol.tokenId), [result.imageMessage], meta);
  return {
    ok: true,
    imageMessage: result.imageMessage,
    thread: {
      ...thread,
      sceneId: result.sceneId,
      sceneImages: result.sceneImages,
      usedImageIds: result.usedImageIds,
      messages: [...thread.messages, result.imageMessage],
    },
  };
}

export const GENERATE_PHOTO_JOBS = 1;

export async function generateNewPhotosForUser(
  user: AppUser,
  idol: Idol,
  thread: ChatThread,
  generation?: { prompt?: string; tags?: string },
): Promise<void> {
  const history = thread.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => !m.error && m.content.trim())
    .slice(-36)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const fanWallet = await resolveConnectedWallet(user);
  const payload = {
    tokenId: idol.tokenId,
    sceneId: thread.sceneId,
    history,
    fanWallet: fanWallet ?? undefined,
    prompt: generation?.prompt,
    tags: generation?.tags,
  };
  await Promise.all(
    Array.from({ length: GENERATE_PHOTO_JOBS }, (_, variation) =>
      generateNewPhotosServer({ data: { ...payload, variation } }).catch(() => undefined),
    ),
  );
}

export async function attachChatVoiceForUser(
  user: AppUser,
  thread: ChatThread,
  input: { spoken: string; chapter: number; voiceId: string; tokenId: number },
): Promise<{ ok: true; voiceMessage?: ChatMsg; thread: ChatThread } | { ok: false; error: string }> {
  const spoken = input.spoken.trim().slice(0, 280);
  if (!spoken) return { ok: true, thread };
  const { speakText } = await import("@/lib/ai");
  let audio: { ok: true; audioBase64: string } | { ok: false };
  try {
    audio = await Promise.race([
      speakText({ data: { text: spoken, voiceId: input.voiceId } }),
      new Promise<{ ok: false }>((resolve) => {
        window.setTimeout(() => resolve({ ok: false }), 20_000);
      }),
    ]);
  } catch {
    return { ok: true, thread };
  }
  if (!audio.ok || !("audioBase64" in audio) || !audio.audioBase64) {
    return { ok: true, thread };
  }

  const voiceMessage: ChatMsg = {
    id: uid(),
    role: "assistant",
    content: "",
    chapter: input.chapter,
    audioUrl: `data:audio/mpeg;base64,${audio.audioBase64}`,
  };
  const next: ChatThread = {
    ...thread,
    messages: [...thread.messages, voiceMessage],
  };
  await persistChatThread(user, input.tokenId, next);
  return { ok: true, voiceMessage, thread: next };
}

export async function searchThreadMessages(
  user: AppUser,
  tokenId: number,
  thread: ChatThread,
  query: string,
): Promise<ChatMsg[]> {
  const storageUserId = localChatUserId(user);
  const q = query.trim();
  const all = thread.messages;
  if (!q) return all;
  const ids = await searchLocalMessages(storageUserId, String(tokenId), q);
  if (ids.length === 0) {
    return all.filter((m) => m.content.toLowerCase().includes(q.toLowerCase()));
  }
  const idSet = new Set(ids);
  return all.filter((m) => idSet.has(m.id));
}
