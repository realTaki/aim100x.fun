import { resolveUserAiBackend, backendWallet } from "./ai-user.server";
import { paidFetch, ELEVENLABS_STT_URL } from "./x402-payment.server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hasHan } from "@/lib/utils";
import { authMiddleware } from "@/lib/auth/middleware";
import { fetchIdolTokenOwner } from "@/lib/idol-manager-onchain";
import { decodeTtsAudio, postAiRequest, ttsRequest, type MiniMaxBackend } from "@/lib/ai-provider";

export type ImageCandidate = {
  id: string;
  scene: string;
  tags: string;
  prompt: string;
};

export type ChatTurnResult =
  | {
      ok: true;
      reply: string;
      choices: string[];
      imageId?: string;
      audioBase64?: string;
      fallback?: boolean;
      sendPhoto?: boolean;
      expandLibrary?: boolean;
      photoPrompt?: string;
      photoTags?: string;
      sendVoice?: boolean;
      voiceText?: string;
    }
  | { ok: false; error: string };

export const speakText = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number; text: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const { synthesizeChatVoice } = await import("./chat-voice.server");
    return synthesizeChatVoice({ userId: context.userId, tokenId: data.tokenId, text: data.text });
  });

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((input: { audioBase64: string; mimeType: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const backend = await resolveUserAiBackend();
    if (!backend) return { ok: false, error: "Voice isn't available right now" };
    if (!data.audioBase64 || data.audioBase64.length > 2_000_000) {
      return { ok: false, error: "Recording is too long — keep it shorter" };
    }

    const bytes = Buffer.from(data.audioBase64, "base64");
    const mime = data.mimeType || "audio/webm";
    const ext = mime.includes("mp4")
      ? "mp4"
      : mime.includes("mpeg")
        ? "mp3"
        : mime.includes("wav")
          ? "wav"
          : "webm";
    const form = new FormData();
    form.append("file", new File([bytes], `audio.${ext}`, { type: mime }));
    form.append("model_id", "scribe_v1");
    const res = await paidFetch(backendWallet(backend), ELEVENLABS_STT_URL, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) return { ok: false, error: "Couldn't hear that. Try again." };
    const body = (await res.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return { ok: false, error: "Couldn't hear that. Try again." };
    return { ok: true, text };
  });

export const designVoice = createServerFn({ method: "POST" })
  .validator((input: { tokenId: number; prompt: string; previewText: string }) => input)
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; voiceId: string; audioBase64: string } | { ok: false; error: string }
    > => {
      const prompt = data.prompt.trim();
      const previewText = data.previewText.trim();
      if (!prompt || !previewText) return { ok: false, error: "Enter a voice description first" };
      if (prompt.length > 500 || previewText.length > 500) {
        return { ok: false, error: "Voice description or preview text is too long" };
      }
      if (!Number.isSafeInteger(data.tokenId) || data.tokenId < 1) {
        return { ok: false, error: "Unknown idol" };
      }
      const { sessionUserFromRequest } = await import("./auth/wallet-auth-http.server");
      const request = getRequest();
      const user = request ? await sessionUserFromRequest(request) : null;
      const owner = await fetchIdolTokenOwner(data.tokenId);
      if (!user || owner?.toLowerCase() !== user.id.toLowerCase())
        return { ok: false, error: "Only the creator can design a voice" };
      // Hub currently has TTS but no voice_design route. Never charge a platform key instead.
      return {
        ok: false,
        error: "Voice design is not available on this API service. Use an existing voice ID.",
      };
    },
  );

export const localizeOpening = createServerFn({ method: "POST" })
  .validator(
    (input: {
      opening: string;
      heading?: string;
      welcome?: string;
      locale: string;
      idolName: string;
    }) => input,
  )
  .middleware([authMiddleware])
  .handler(
    async ({
      data,
    }): Promise<
      { ok: true; opening: string; heading?: string; welcome?: string } | { ok: false }
    > => {
      const { localizeOpeningTexts } = await import("@/lib/ai.server");
      const next = await localizeOpeningTexts(data);
      if (!next) return { ok: false };
      return { ok: true, ...next };
    },
  );
