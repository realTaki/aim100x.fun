import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import type { ChatMsg } from "@/lib/thread";
import { seenImageIds } from "@/lib/thread";
import { uid } from "@/lib/utils";
import { normalizeMediaId } from "@/lib/media-app-id";
import { sceneIdOf, sceneQueryForIdol } from "@/lib/library";
import { listUnusedImages, matchImageByHint, mergeUsedImageId } from "@/lib/library";
import { sceneSetting, sceneTopic } from "@/lib/idol-fields";
import { sceneAt } from "@/lib/idols";
import { buildTestnetChatSystemPrompt, testnetWantImage } from "@/lib/testnet-chat-turn";

async function isFanOf(userId: string, tokenId: number, bearerToken?: string) {
  const { isFanMembershipActive } = await import("@/lib/subscribe/fan-membership.server");
  return isFanMembershipActive(userId, tokenId, bearerToken);
}

async function isChatFan(
  _fanWallet: string | undefined,
  userId: string,
  tokenId: number,
  bearerToken?: string,
) {
  return isFanOf(userId, tokenId, bearerToken);
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

/** On-chain fan membership for UI + chat gate (no database). */
export const getFan = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const isFan = await isFanOf(context.userId, data.tokenId, undefined);
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
    const isFan = await isChatFan(data.fanWallet, context.userId, data.tokenId, undefined);
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
      requestId: string;
      tokenId: number;
      content: string;
      thread: ThreadSnapshot;
      fanWallet?: string;
      fanSentVoice?: boolean;
      fan?: { username?: string; bio?: string; locale?: string };
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server.ts");
    const user = await sessionUserFromRequest(getRequest());
    if (!user) return { ok: false as const, error: "Sign in required" };
    // Subscription/content authorization remains unchanged; this pass replaces only text billing.
    if (!(await isChatFan(undefined, context.userId, data.tokenId)))
      return { ok: false as const, error: "not_fan" };
    const idol = await loadIdolByTokenId(data.tokenId);
    if (!idol) return { ok: false as const, error: "Unknown idol" };
    const { testnetTextChat } = await import("./testnet-chat.server.ts");
    const chapter = Math.max(
      0,
      Math.min(idol.scenes.length - 1, Number(data.thread.chapter) || 0),
    );
    const scene = sceneAt(idol, chapter);
    const wantImage = testnetWantImage(data.content);
    try {
      const result = await testnetTextChat(
        user,
        {
          requestId: data.requestId,
          tokenId: data.tokenId,
          content: data.content,
          history: data.thread.messages
            .filter((m) => !m.error && (m.role === "user" || m.role === "assistant"))
            .slice(-36)
            .map((m) => ({ role: m.role, content: m.content })),
        },
        buildTestnetChatSystemPrompt(idol, {
          chapterTitle: sceneTopic(scene),
          theme: sceneSetting(scene),
          fan: data.fan,
          wantImage,
        }),
      );
      if (!result.ok)
        return { ok: false as const, error: `${result.error} Message ID: ${result.requestId}` };
      const userMessage: ChatMsg = {
        id: `${result.requestId}:user`,
        role: "user",
        content: data.content.trim(),
        chapter,
      };
      const assistantMessage: ChatMsg = {
        id: `${result.requestId}:assistant`,
        role: "assistant",
        content: result.reply,
        chapter,
      };
      return {
        ok: true as const,
        userMessage,
        reply: result.reply,
        assistantMessage,
        choices: [] as string[],
        wantImage,
        wantVoice: false,
        voiceText: undefined as string | undefined,
        imageId: undefined as string | undefined,
        fallback: false,
        chapter,
        sceneId: sceneIdOf(idol, chapter),
        sceneImages: data.thread.sceneImages ?? 0,
      };
    } catch (error) {
      // Never return upstream/RPC error bodies, which may contain configuration or prompts.
      const message =
        error instanceof Error &&
        /^(Not enough testnet LUSD|Configure MINIMAX_CN_API_KEY|Message ID belongs)/.test(
          error.message,
        )
          ? error.message
          : "Text request unresolved. Retry the same message; no new payment is authorized.";
      return { ok: false as const, error: message };
    }
  });

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
      if (!(await isChatFan(data.fanWallet, context.userId, data.tokenId, undefined))) {
        return { ok: false, error: "not_fan" };
      }

      const sceneId = data.sceneId || sceneIdOf(idol, data.chapter);
      const excludeFromThread = new Set((data.threadImageIds ?? []).filter((id) => id.length > 0));
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
        imageId: hit.id,
        imageUrl: hit.contentRating === "NSFW" ? undefined : hit.url,
        imageContentRating:
          hit.contentRating === "NSFW" || hit.contentRating === "SFW"
            ? hit.contentRating
            : undefined,
      };
      if (hit.contentRating === "NSFW") {
        const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server");
        const request = getRequest();
        const user = request ? await sessionUserFromRequest(request) : null;
        if (!user || user.walletAddress.toLowerCase() !== context.userId || !user.walletAddress)
          return { ok: false, error: "Prepare your wallet first" };
        const { issueImagePayment } = await import("@/lib/chat-image-payment.server");
        const { imagePaymentReader } = await import("./chat-image-payment.server");
        const { idolImageUnlockPriceUsdc, usdcToAtomicString } = await import("@/lib/idol-pricing");
        const reader = imagePaymentReader();
        const amount = usdcToAtomicString(idolImageUnlockPriceUsdc(idol));
        imageMessage.imagePaymentAmount = amount;
        imageMessage.imagePaymentIntent = await issueImagePayment(
          user.walletAddress.toLowerCase(),
          {
            imageId: hit.id,
            tokenId: data.tokenId,
            amount,
            wallet: user.walletAddress,
            fromBlock: String(await reader.getBlockNumber()),
          },
        );
      }
      return {
        ok: true,
        imageMessage,
        sceneId,
        sceneImages: data.sceneImages + 1,
        usedImageIds,
      };
    },
  );

export const prepareChatImage = createServerFn({ method: "POST" })
  .validator((input: { imageId: string; paymentIntent: string }) => {
    if (
      typeof input.imageId !== "string" ||
      input.imageId.length > 160 ||
      typeof input.paymentIntent !== "string" ||
      input.paymentIntent.length > 4096
    )
      throw new Error("Invalid checkout");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server");
    const user = await sessionUserFromRequest(getRequest());
    if (!user?.walletAddress || user.walletAddress.toLowerCase() !== context.userId)
      throw new Error("Sign in to your APP account");
    const { prepareImagePayment } = await import("./chat-image-payment.server");
    return prepareImagePayment(
      user.walletAddress.toLowerCase(),
      user.walletAddress,
      data.imageId,
      data.paymentIntent,
    );
  });
export const unlockChatImage = createServerFn({ method: "POST" })
  .validator(
    (input: { imageId: string; paymentIntent: string; transactionHash: `0x${string}` }) => {
      if (
        typeof input.imageId !== "string" ||
        input.imageId.length > 160 ||
        typeof input.paymentIntent !== "string" ||
        input.paymentIntent.length > 4096 ||
        typeof input.transactionHash !== "string" ||
        !/^0x[a-f0-9]{64}$/i.test(input.transactionHash)
      )
        throw new Error("Invalid checkout");
      return input;
    },
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server");
    const user = await sessionUserFromRequest(getRequest());
    if (!user?.walletAddress || user.walletAddress.toLowerCase() !== context.userId)
      throw new Error("Sign in to your APP account");
    const { settleImagePayment } = await import("./chat-image-payment.server");
    return {
      ok: true as const,
      ...(await settleImagePayment(
        user.walletAddress.toLowerCase(),
        user.walletAddress,
        data.imageId,
        data.paymentIntent,
        data.transactionHash,
      )),
    };
  });

export const quoteImageUnlock = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number; imageId: string; maxAmountAtomic: string }) => {
    if (
      !Number.isSafeInteger(input.tokenId) ||
      input.tokenId < 1 ||
      typeof input.imageId !== "string" ||
      input.imageId.length > 160 ||
      typeof input.maxAmountAtomic !== "string" ||
      !/^\d{1,30}$/.test(input.maxAmountAtomic)
    )
      throw new Error("Invalid photo");
    return input;
  })
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server");
    const user = await sessionUserFromRequest(getRequest());
    if (!user?.walletAddress || user.walletAddress.toLowerCase() !== context.userId)
      throw new Error("Sign in first");
    const { requireAvailablePaymentImage } = await import("./chat-image-availability.server");
    await requireAvailablePaymentImage(data.imageId, data.tokenId);
    const idol = await loadIdolByTokenId(data.tokenId);
    if (!idol) throw new Error("Unknown idol");
    const { idolImageUnlockPriceUsdc, usdcToAtomicString } = await import("./idol-pricing");
    const amount = usdcToAtomicString(idolImageUnlockPriceUsdc(idol));
    if (BigInt(amount) > BigInt(data.maxAmountAtomic))
      throw new Error("Photo price changed. Refresh before paying.");
    const { issueImagePayment, imagePaymentReader } = await import("./chat-image-payment.server");
    return {
      paymentIntent: await issueImagePayment(user.walletAddress.toLowerCase(), {
        imageId: data.imageId,
        tokenId: data.tokenId,
        amount,
        wallet: user.walletAddress,
        fromBlock: String(await imagePaymentReader().getBlockNumber()),
      }),
    };
  });
