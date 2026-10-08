import { createHash } from "node:crypto";
import {
  BLOCKRUN_CHAT_URL,
  BLOCKRUN_IMAGE_URL,
  MONAD_CHAT_MODEL,
  MONAD_IMAGE_MODEL,
  monadChatPayload,
} from "./monad-ai.ts";
import { env } from "./env.server.ts";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { pixelsForSlot, type ImageSlotKind } from "./image-aspect.ts";

export type AiKind = "minimax" | "x402";

export type ImageGenerationRequest = {
  prompt: string;
  contentRating: ImageContentRating;
  /** Default cover/pool portrait 1152×1728. */
  slot?: ImageSlotKind;
  /** MiniMax `n`. Default 1. */
  count?: number;
  referenceImage?: string;
};

export type AiBackend = {
  kind: AiKind;
  imageModel?: string;
  apiKey: string;
  promptCacheKey?: string;
  loginAddress?: `0x${string}`;
  walletAddress?: `0x${string}`;
};

export type MiniMaxBackend = AiBackend;

/**
 * China MiniMax only (platform.minimax.cn). Never api.minimax.io / global.
 * Chat + image + TTS: https://api.minimax.cn
 * STT examples on the CN speech guide still use https://api.minimaxi.com
 */
export const MINIMAX_API_HOST = "https://api.minimax.cn";
export const MINIMAX_STT_HOST = "https://api.minimaxi.com";
export const MINIMAX_CN_API_KEY_ENV = "MINIMAX_CN_API_KEY";

/** MiniMax CN when `MINIMAX_CN_API_KEY` is set. There is no Grok/xAI fallback. */
export function resolveAiBackend(): AiBackend | undefined {
  const apiKey = env(MINIMAX_CN_API_KEY_ENV);
  return apiKey ? { kind: "minimax", apiKey } : undefined;
}

export function resolveMiniMaxBackend(): MiniMaxBackend | undefined {
  return resolveAiBackend();
}

export function chatCompletionUrl(): string {
  return `${MINIMAX_API_HOST}/v1/chat/completions`;
}

export function chatCompletionPayload(body: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    ...body,
    model: "MiniMax-M3",
  };
  // MiniMax-M3 thinks by default and would pollute JSON replies.
  payload.thinking = { type: "disabled" };
  // CN OpenAI Chat Completions documents `tools` but not `tool_choice`.
  // Sending tool_choice: "auto" is 2013 参数错误, the no-tools retry then
  // dumps MiniMax's native invoke text into assistant content.
  delete payload.tool_choice;
  return payload;
}

/** Abort the model before Vercel Hobby's 60s maxDuration so we can still return JSON. */
export const CHAT_COMPLETION_TIMEOUT_MS = 45_000;

export function chatCompletionTimeoutSignal(ms = CHAT_COMPLETION_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

export async function postChatCompletions(
  backend: AiBackend,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal; purpose?: string },
): Promise<Response> {
  if (backend.kind === "x402") {
    const { postPaidAi } = await import("./ai-user.server");
    const response = await postPaidAi(
      backend,
      BLOCKRUN_CHAT_URL,
      monadChatPayload(
        {
          ...body,
          ...(backend.promptCacheKey ? { prompt_cache_key: backend.promptCacheKey } : {}),
        },
        env("X402_CHAT_MODEL") ?? MONAD_CHAT_MODEL,
      ),
      init,
    );
    await response
      .clone()
      .json()
      .then((body) => logChatUsage(body, init?.purpose))
      .catch(() => {});
    return response;
  }
  return fetch(chatCompletionUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${backend.apiKey}`,
    },
    body: JSON.stringify(chatCompletionPayload(body)),
    signal: init?.signal,
  });
}

export function ttsRequest(
  backend: MiniMaxBackend,
  text: string,
  voiceId: string,
  language: "zh" | "en" | "auto",
): { url: string; body: Record<string, unknown> } {
  return {
    url: `${MINIMAX_API_HOST}/v1/t2a_v2`,
    body: {
      model: "speech-2.8-turbo",
      text,
      stream: false,
      output_format: "hex",
      language_boost: language === "auto" ? "auto" : language === "zh" ? "Chinese" : "English",
      voice_setting: { voice_id: voiceId },
      audio_setting: { format: "mp3", channel: 1 },
    },
  };
}

export function sttRequest(_backend: MiniMaxBackend): {
  url: string;
  extraFields?: Record<string, string>;
} {
  return {
    url: `${MINIMAX_STT_HOST}/v1/speech_to_text`,
    extraFields: { model: "asr-1.0" },
  };
}

export function voiceDesignRequest(
  backend: MiniMaxBackend,
  prompt: string,
  previewText: string,
): { url: string; body: Record<string, unknown> } {
  return {
    url: `${MINIMAX_API_HOST}/v1/voice_design`,
    body: { prompt, preview_text: previewText },
  };
}

function imageSizeBody(request: ImageGenerationRequest): Record<string, unknown> {
  const slot = request.slot ?? "cover";
  const { width, height } = pixelsForSlot(slot);
  return { width, height };
}

export function imageEditRequest(
  backend: AiBackend,
  request: ImageGenerationRequest,
  refDataUri: string,
): { url: string; body: Record<string, unknown> } {
  if (backend.kind === "x402" && backend.imageModel !== "image-01") {
    throw new Error("The selected Grok route does not support reference images; use image-01");
  }
  const { prompt, count } = request;
  const n = Math.min(4, Math.max(1, count ?? 1));
  return {
    url: `${MINIMAX_API_HOST}/v1/image_generation`,
    body: {
      model: "image-01",
      prompt: prompt.slice(0, 1500),
      subject_reference: [{ type: "character", image_file: refDataUri }],
      n,
      ...(request.referenceImage
        ? { subject_reference: [{ type: "character", image_file: request.referenceImage }] }
        : {}),
      ...imageSizeBody(request),
      response_format: "base64",
    },
  };
}

export function imageGenerateRequest(
  backend: AiBackend,
  request: ImageGenerationRequest,
): { url: string; body: Record<string, unknown> } {
  const { prompt, count } = request;
  const n = Math.min(4, Math.max(1, count ?? 1));
  if (backend.kind === "x402" && backend.imageModel !== "image-01") {
    if (backend.imageModel && backend.imageModel !== MONAD_IMAGE_MODEL)
      throw new Error("Unsupported X402_IMAGE_MODEL; use xai/grok-imagine-image-2.0 or image-01");
    return {
      url: BLOCKRUN_IMAGE_URL,
      body: {
        model: MONAD_IMAGE_MODEL,
        prompt: prompt.slice(0, 1500),
        n,
        size: "1024x1024",
        response_format: "b64_json",
      },
    };
  }
  return {
    url: `${MINIMAX_API_HOST}/v1/image_generation`,
    body: {
      model: "image-01",
      prompt: prompt.slice(0, 1500),
      n,
      ...(request.referenceImage
        ? { subject_reference: [{ type: "character", image_file: request.referenceImage }] }
        : {}),
      ...imageSizeBody(request),
      response_format: "base64",
    },
  };
}

function minimaxStatusOk(json: unknown): boolean {
  if (!json || typeof json !== "object") return true;
  const code = (json as { base_resp?: { status_code?: unknown } }).base_resp?.status_code;
  return code === undefined || code === 0;
}

/** MiniMax chat may return HTTP 200 with `base_resp.status_code` ≠ 0. */
export function isAiChatBodyOk(json: unknown): boolean {
  return minimaxStatusOk(json);
}

export function decodeTtsAudio(json: unknown): string | undefined {
  if (!minimaxStatusOk(json)) return undefined;
  const hex = (json as { data?: { audio?: unknown } })?.data?.audio;
  if (typeof hex !== "string" || !hex.trim()) return undefined;
  const clean = hex.replace(/\s+/g, "");
  if (clean.length < 160 || clean.length % 2 !== 0) return undefined;
  const buf = Buffer.from(clean, "hex");
  if (buf.byteLength < 80) return undefined;
  return buf.toString("base64");
}

export function decodeGeneratedImage(json: unknown): { b64?: string; url?: string } | undefined {
  return decodeGeneratedImages(json)[0];
}

export function decodeGeneratedImages(json: unknown): { b64?: string; url?: string }[] {
  if (!json || typeof json !== "object") return [];
  if (!minimaxStatusOk(json)) return [];
  const root = json as {
    data?:
      { b64_json?: string; url?: string }[] | { image_base64?: string[]; image_urls?: string[] };
  };
  const data = root.data;
  const out: { b64?: string; url?: string }[] = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item?.b64_json) out.push({ b64: item.b64_json });
      else if (item?.url) out.push({ url: item.url });
    }
    return out;
  }
  if (data && typeof data === "object") {
    for (const b64 of data.image_base64 ?? []) {
      if (typeof b64 === "string" && b64) out.push({ b64 });
    }
    if (out.length === 0) {
      for (const url of data.image_urls ?? []) {
        if (typeof url === "string" && url) out.push({ url });
      }
    }
  }
  return out;
}

/** Route user-paid media through the same guarded wallet payment client. */
export async function postAiRequest(
  backend: AiBackend,
  request: { url: string; body: Record<string, unknown> },
) {
  if (backend.kind === "x402") {
    const { postPaidAi } = await import("./ai-user.server");
    return postPaidAi(backend, request.url, request.body);
  }
  return fetch(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${backend.apiKey}` },
    body: JSON.stringify(request.body),
  });
}

export function chatPromptCacheKey(userId: string, scope: string) {
  return createHash("sha256")
    .update("aim100x.fun/chat-cache/v1\0")
    .update(userId.toLowerCase())
    .update("\0")
    .update(scope)
    .digest("hex");
}
export function logChatUsage(body: unknown, purpose = "chat") {
  const usage = (body as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== "object") return;
  const number = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);
  const prompt = usage.prompt_tokens_details as { cached_tokens?: unknown } | undefined;
  const completion = usage.completion_tokens_details as { reasoning_tokens?: unknown } | undefined;
  console.info("ai.chat.usage", {
    purpose,
    prompt_tokens: number(usage.prompt_tokens),
    completion_tokens: number(usage.completion_tokens),
    total_tokens: number(usage.total_tokens),
    cached_tokens: number(prompt?.cached_tokens),
    reasoning_tokens: number(completion?.reasoning_tokens),
  });
}
export function imageMime(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP")
    return "image/webp";
  throw new Error("Provider returned an unsupported image format");
}
/** Exactly one charged submission. Use the reference-capable MiniMax route for anchored jobs. */
export async function generatePaidImages(backend: AiBackend, request: ImageGenerationRequest) {
  const selected =
    request.referenceImage && !backend.imageModel
      ? { ...backend, imageModel: "image-01" }
      : backend;
  if (request.referenceImage && selected.imageModel !== "image-01")
    throw new Error("Reference images require image-01 on Monad Hub");
  const res = await postAiRequest(selected, imageGenerateRequest(selected, request));
  if (!res.ok) throw new Error(`Image generation failed (${res.status})`);
  const images = [];
  for (const image of decodeGeneratedImages(await res.json())) {
    let bytes: Buffer;
    if (image.b64) bytes = Buffer.from(image.b64, "base64");
    else if (image.url) {
      const response = await fetch(image.url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error("Image download failed");
      bytes = Buffer.from(await response.arrayBuffer());
    } else continue;
    images.push({ b64: bytes.toString("base64"), mime: imageMime(bytes) });
  }
  return images;
}
