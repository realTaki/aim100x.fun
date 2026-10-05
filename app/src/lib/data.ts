import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { nextScene, sceneId as idolSceneId, sceneIndex } from "@/lib/idols";
import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import type { ChatMsg } from "@/lib/thread";
import { seenImageIds } from "@/lib/thread";
import { uid } from "@/lib/utils";
import { normalizeMediaId } from "@/lib/media-app-id";
import { sceneIdOf, sceneQueryForIdol } from "@/lib/library";
import {
  SCENE_STAY_LIMIT,
  ensureSeedLibrary,
  listUnusedImages,
  matchImageByHint,
  mergeUsedImageId,
} from "@/lib/library";
import { chatCompletionTimeoutMs, chatTurnBudgetMs } from "@/lib/chat-timeout";

async function isFanOf(userId: string, tokenId: number) {
  const { isFanMembershipActive } = await import("@/lib/subscribe/fan-membership.server");
  return isFanMembershipActive(userId, tokenId);
}

async function isChatFan(fanWallet: string | undefined, userId: string, tokenId: number) {
  const w = fanWallet?.trim();
  if (w && /^0x[a-fA-F0-9]{40}$/i.test(w)) {
    const { isFanForWallet } = await import("@/lib/subscribe/fan-membership.server");
    return isFanForWallet(w, tokenId);
  }
  return isFanOf(userId, tokenId);
}

function raceTimeout<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = work.then(
    (value) => value,
    () => fallback,
  );
  return Promise.race([
    settled.finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

/** Leave enough time to serialize a JSON response before Hobby's 60s maxDuration. */
const FAN_CHECK_BUDGET_MS = 1500;

function requestChatHost(): string {
  try {
    const request = getRequest();
    const origin = request?.headers.get("origin") ?? request?.headers.get("referer") ?? "";
    if (origin) {
      try {
        const host = new URL(origin).hostname;
        if (host) return host;
      } catch {
        /* fall through */
      }
    }
    const forwarded = request?.headers.get("x-forwarded-host") ?? "";
    const host = forwarded.split(",")[0]?.trim() || request?.headers.get("host") || "";
    return host.split(":")[0] ?? host;
  } catch {
    return "";
  }
}

/** On-chain fan membership for UI + chat gate (no database). */
export const getFan = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const isFan = await isFanOf(context.userId, data.tokenId);
    return { isFan };
  });

export const bootstrapThreadChoices = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tokenId: number;
      chapter?: number;
      messages: { role: "user" | "assistant"; content: string }[];
      lastChoices?: string[];
      fanWallet?: string;
      fan?: { username?: string; bio?: string; locale?: string };
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const isFan = await isChatFan(data.fanWallet, context.userId, data.tokenId);
    if (!isFan) {
      return { ok: false as const, choices: [] as string[] };
    }
    const { suggestChoices } = await import("@/lib/ai.server");
    const choices = await suggestChoices({
      tokenId: data.tokenId,
      chapter: data.chapter ?? 0,
      messages: data.messages,
      lastChoices: data.lastChoices,
      fan: data.fan,
    });
    return { ok: true as const, choices };
  });

type ThreadSnapshot = {
  chapter: number;
  sceneId: string;
  sceneImages: number;
  messages: ChatMsg[];
  choicesByChapter: Record<number, string[]>;
  usedImageIds: string[];
};

export const sendChat = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tokenId: number;
      content: string;
      thread: ThreadSnapshot;
      fanWallet?: string;
      fanSentVoice?: boolean;
      fan?: { username?: string; bio?: string; locale?: string };
    }) =>
      input,
  )
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }): Promise<
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
          chapter: number;
          sceneId: string;
          sceneImages: number;
        }
      | { ok: false; error: string }
    > => {
      const content = data.content.trim().slice(0, 500);
      if (!content) return { ok: false, error: "Empty message" };
      const idol = await loadIdolByTokenId(data.tokenId);
      if (!idol) return { ok: false, error: "Unknown idol" };

      const thread = data.thread;
      let sceneKey = thread.sceneId || sceneIdOf(idol, thread.chapter);
      const chapter = sceneIndex(idol, sceneKey);

      const isFan = await raceTimeout(
        FAN_CHECK_BUDGET_MS,
        isChatFan(data.fanWallet, context.userId, data.tokenId),
        true,
      );
      if (!isFan) {
        return { ok: false, error: "not_fan" };
      }

      let sceneImages = thread.sceneImages ?? 0;
      if (sceneImages >= SCENE_STAY_LIMIT) {
        sceneKey = idolSceneId(nextScene(idol, sceneKey));
        sceneImages = 0;
      }
      const chapterActive = sceneIndex(idol, sceneKey);

      void ensureSeedLibrary().catch(() => undefined);

      const userMessage: ChatMsg = {
        id: uid(),
        role: "user",
        content,
        chapter: chapterActive,
      };

      const history = [...thread.messages, userMessage]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const seen = seenImageIds(thread);
      const host = requestChatHost();
      const unusedWait = 1200;
      const unused = await raceTimeout(
        unusedWait,
        listUnusedImages({
          tokenId: data.tokenId,
          sceneId: sceneKey,
          sceneQuery: sceneQueryForIdol(idol, sceneKey),
          usedImageIds: seen,
        }),
        [],
      );

      const { completeTurn } = await import("@/lib/ai.server");
      const turnBudget = Math.max(400, chatTurnBudgetMs(host) - 500);
      let result: Awaited<ReturnType<typeof completeTurn>>;
      try {
        result = await raceTimeout(
          turnBudget,
          completeTurn({
            tokenId: data.tokenId,
            chapter: chapterActive,
            messages: history,
            speak: false,
            lastChoices: thread.choicesByChapter[thread.chapter],
            sceneId: sceneKey,
            fanSentVoice: Boolean(data.fanSentVoice),
            completionTimeoutMs: chatCompletionTimeoutMs(host),
            fan: data.fan,
            imageCandidates: unused.slice(0, 24).map((r) => ({
              id: r.id,
              scene: r.scene_id,
              tags: r.tags,
              prompt: r.prompt.slice(0, 80),
            })),
          }),
          { ok: false, error: "ai_timeout" },
        );
      } catch {
        return { ok: false, error: "ai_request_failed" };
      }
      if (!result.ok) return result;

      const { sanitizeIdolReply, userWantsPhoto } = await import("@/lib/chat-reply");
      const assistantMessage: ChatMsg = {
        id: uid(),
        role: "assistant",
        content: sanitizeIdolReply(result.reply),
        chapter: chapterActive,
      };

      const wantImage = Boolean(result.sendPhoto) || userWantsPhoto(content);
      const wantVoice = Boolean(result.sendVoice);
      const voiceText = result.voiceText?.trim() || undefined;
      const restock = Boolean(result.expandLibrary && result.photoPrompt) && unused.length < 6;

      return {
        ok: true,
        userMessage,
        reply: assistantMessage.content,
        assistantMessage,
        choices: result.choices,
        wantImage,
        imageId: result.imageId,
        wantVoice,
        voiceText,
        generatePhotos: restock,
        photoPrompt: restock ? result.photoPrompt : undefined,
        photoTags: restock ? result.photoTags : undefined,
        chapter: chapterActive,
        sceneId: sceneKey,
        sceneImages,
      };
    },
  );

export const attachChatImage = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tokenId: number;
      reply: string;
      chapter: number;
      sceneId: string;
      sceneImages: number;
      history: { role: "user" | "assistant"; content: string }[];
      usedImageIds: string[];
      imageId?: string;
      threadImageIds?: string[];
      fanWallet?: string;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(
    async ({
      context,
      data,
    }): Promise<
      | {
          ok: true;
          imageMessage?: ChatMsg;
          sceneId: string;
          sceneImages: number;
          usedImageIds: string[];
        }
      | { ok: false; error: string }
    > => {
      const idol = await loadIdolByTokenId(data.tokenId);
      if (!idol) return { ok: false, error: "Unknown idol" };
      if (!(await isChatFan(data.fanWallet, context.userId, data.tokenId))) {
        return { ok: false, error: "not_fan" };
      }

      const sceneId = data.sceneId || sceneIdOf(idol, data.chapter);
      const excludeFromThread = new Set(
        (data.threadImageIds ?? []).filter((id) => id.length > 0),
      );
      const unused = await listUnusedImages({
        tokenId: data.tokenId,
        sceneId,
        sceneQuery: sceneQueryForIdol(idol, sceneId),
        usedImageIds: data.usedImageIds,
        excludeImageIds: excludeFromThread,
      });
      if (unused.length === 0) {
        return {
          ok: true,
          sceneId,
          sceneImages: data.sceneImages,
          usedImageIds: data.usedImageIds,
        };
      }

      const history = data.history;
      const picked = data.imageId
        ? unused.find((r) => normalizeMediaId(r.id) === normalizeMediaId(data.imageId!))
        : undefined;
      let hit = picked ?? unused[0];
      if (!picked) {
        hit =
          matchImageByHint(
            unused,
            sceneId,
            `${data.reply} ${history.map((m) => m.content).join(" ")}`,
          ) ?? unused[0];
      }
      if (!hit) {
        return {
          ok: true,
          sceneId,
          sceneImages: data.sceneImages,
          usedImageIds: data.usedImageIds,
        };
      }

      const usedImageIds = mergeUsedImageId(data.usedImageIds, hit.id);
      const imageMessage: ChatMsg = {
        id: uid(),
        role: "assistant",
        content: "",
        chapter: data.chapter,
        imageUrl: hit.url,
        imageContentRating:
          hit.contentRating === "NSFW" || hit.contentRating === "SFW"
            ? hit.contentRating
            : undefined,
      };
      return {
        ok: true,
        imageMessage,
        sceneId,
        sceneImages: data.sceneImages + 1,
        usedImageIds,
      };
    },
  );

export const generateNewPhotos = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tokenId: number;
      sceneId: string;
      history: { role: "user" | "assistant"; content: string }[];
      fanWallet?: string;
      variation?: number;
      prompt?: string;
      tags?: string;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const idol = await loadIdolByTokenId(data.tokenId);
    if (!idol) return { ok: false, error: "Unknown idol" };
    if (!(await isChatFan(data.fanWallet, context.userId, data.tokenId))) {
      return { ok: false, error: "not_fan" };
    }
    const { expandSceneLibrary } = await import("@/lib/image-gen");
    await expandSceneLibrary({
      tokenId: data.tokenId,
      sceneId: data.sceneId,
      messages: data.history.slice(-36),
      triggerUserId: context.userId,
      contentRating: "NSFW",
      variation: data.variation,
      prompt: data.prompt,
      tags: data.tags,
    });
    return { ok: true };
  });
