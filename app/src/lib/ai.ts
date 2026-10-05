import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { hasHan } from "@/lib/utils";
import { authMiddleware } from "@/lib/auth/middleware";
import { fetchIdolTokenOwner, fetchPasskeyPublicKey } from "@/lib/idol-manager-onchain";
import { passkeyRpFromRequest, verifyPasskeyAssertionIssue } from "@/lib/auth/passkey-verify.server";
import { voiceDesignPayloadJson, type VoiceDesignProof } from "@/lib/voice-design-proof";
import {
  decodeTtsAudio,
  resolveMiniMaxBackend,
  sttRequest,
  ttsRequest,
  voiceDesignRequest,
  type MiniMaxBackend,
} from "@/lib/ai-provider";

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

async function ttsBase64(backend: MiniMaxBackend, text: string, voiceId: string) {
  const clipped = text.slice(0, 280);
  const language = hasHan(clipped) ? "zh" : "en";
  const req = ttsRequest(backend, clipped, voiceId, language);
  const res = await fetch(req.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backend.apiKey}`,
    },
    body: JSON.stringify(req.body),
  });
  if (!res.ok) return undefined;
  return decodeTtsAudio(await res.json());
}

export const speakText = createServerFn({ method: "POST" })
  .validator((input: { text: string; voiceId: string }) => input)
  .middleware([authMiddleware])
  .handler(
    async ({
      data,
    }): Promise<{ ok: true; audioBase64: string } | { ok: false }> => {
      const backend = resolveMiniMaxBackend();
      if (!backend || !data.voiceId.trim()) return { ok: false };
      const audioBase64 = await ttsBase64(backend, data.text, data.voiceId);
      if (!audioBase64) return { ok: false };
      return { ok: true, audioBase64 };
    },
  );

export const transcribeAudio = createServerFn({ method: "POST" })
  .validator((input: { audioBase64: string; mimeType: string }) => input)
  .middleware([authMiddleware])
  .handler(async ({ data }): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const backend = resolveMiniMaxBackend();
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
    const stt = sttRequest(backend);
    if (stt.extraFields) {
      for (const [key, value] of Object.entries(stt.extraFields)) {
        form.append(key, value);
      }
    }

    const res = await fetch(stt.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${backend.apiKey}` },
      body: form,
    });
    if (!res.ok) return { ok: false, error: "Couldn't hear that. Try again." };
    const body = (await res.json()) as { text?: string };
    const text = (body.text ?? "").trim();
    if (!text) return { ok: false, error: "Couldn't hear that. Try again." };
    return { ok: true, text };
  });

export const designVoice = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tokenId: number;
      prompt: string;
      previewText: string;
      issuedAt: number;
      proof: VoiceDesignProof;
    }) => input,
  )
  .handler(
    async ({ data }): Promise<{ ok: true; voiceId: string; audioBase64: string } | { ok: false; error: string }> => {
      const prompt = data.prompt.trim();
      const previewText = data.previewText.trim();
      if (!prompt || !previewText) return { ok: false, error: "请先填写声音设定" };
      if (prompt.length > 500 || previewText.length > 500) {
        return { ok: false, error: "声音设定或试听文本过长" };
      }
      if (!Number.isSafeInteger(data.tokenId) || data.tokenId < 1) {
        return { ok: false, error: "角色不存在" };
      }
      if (!Number.isSafeInteger(data.issuedAt) || Math.abs(Date.now() - data.issuedAt) > 5 * 60_000) {
        return { ok: false, error: "验证已过期，请重新生成试听" };
      }
      const owner = await fetchIdolTokenOwner(data.tokenId);
      const pubkey = owner ? await fetchPasskeyPublicKey(owner) : null;
      const request = getRequest();
      if (!request || !pubkey) {
        return { ok: false, error: "只有创作者可以生成声音" };
      }
      const challenge = createHash("sha256")
        .update(voiceDesignPayloadJson({
          tokenId: data.tokenId,
          prompt: data.prompt,
          previewText: data.previewText,
          issuedAt: data.issuedAt,
        }))
        .digest("base64url");
      const { origin } = passkeyRpFromRequest(request);
      if (
        verifyPasskeyAssertionIssue({
          body: data.proof,
          origin,
          challenge,
          x: pubkey.x,
          y: pubkey.y,
        }) !== null
      ) {
        return { ok: false, error: "通行密钥验证失败" };
      }
      const backend = resolveMiniMaxBackend();
      if (!backend) return { ok: false, error: "MiniMax 语音服务尚未配置" };
      const req = voiceDesignRequest(backend, prompt, previewText);
      const res = await fetch(req.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${backend.apiKey}`,
        },
        body: JSON.stringify(req.body),
      });
      if (!res.ok) return { ok: false, error: "生成试听失败，请稍后再试" };
      const body = (await res.json()) as { voice_id?: unknown; trial_audio?: unknown };
      const voiceId = typeof body.voice_id === "string" ? body.voice_id.trim() : "";
      const audioBase64 = decodeTtsAudio({ data: { audio: body.trial_audio } });
      if (!voiceId || !audioBase64) return { ok: false, error: "生成试听失败，请稍后再试" };
      return { ok: true, voiceId, audioBase64 };
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
