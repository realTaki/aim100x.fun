import { env } from "./env.server.ts";
import type { ImageContentRating } from "@/lib/image-content-rating";
import { pixelsForSlot, type ImageSlotKind } from "./image-aspect.ts";

export type AiKind = "minimax";

export type ImageGenerationRequest = {
  prompt: string;
  contentRating: ImageContentRating;
  /** Default cover/pool portrait 1152×1728. */
  slot?: ImageSlotKind;
  /** MiniMax `n`. Default 1. */
  count?: number;
};

export type AiBackend = {
  kind: AiKind;
  apiKey: string;
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

export function postChatCompletions(
  backend: AiBackend,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<Response> {
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
  language: "zh" | "en",
): { url: string; body: Record<string, unknown> } {
  return {
    url: `${MINIMAX_API_HOST}/v1/t2a_v2`,
    body: {
      model: "speech-2.8-turbo",
      text,
      stream: false,
      output_format: "hex",
      language_boost: language === "zh" ? "Chinese" : "English",
      voice_setting: { voice_id: voiceId },
      audio_setting: { format: "mp3", channel: 1 },
    },
  };
}

export function sttRequest(_backend: MiniMaxBackend): { url: string; extraFields?: Record<string, string> } {
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
  _backend: AiBackend,
  request: ImageGenerationRequest,
  refDataUri: string,
): { url: string; body: Record<string, unknown> } {
  const { prompt, count } = request;
  const n = Math.min(4, Math.max(1, count ?? 1));
  return {
    url: `${MINIMAX_API_HOST}/v1/image_generation`,
    body: {
      model: "image-01",
      prompt: prompt.slice(0, 1500),
      subject_reference: [{ type: "character", image_file: refDataUri }],
      n,
      ...imageSizeBody(request),
      response_format: "base64",
    },
  };
}

export function imageGenerateRequest(
  _backend: AiBackend,
  request: ImageGenerationRequest,
): { url: string; body: Record<string, unknown> } {
  const { prompt, count } = request;
  const n = Math.min(4, Math.max(1, count ?? 1));
  return {
    url: `${MINIMAX_API_HOST}/v1/image_generation`,
    body: {
      model: "image-01",
      prompt: prompt.slice(0, 1500),
      n,
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

export function decodeGeneratedImage(
  json: unknown,
): { b64?: string; url?: string } | undefined {
  return decodeGeneratedImages(json)[0];
}

export function decodeGeneratedImages(
  json: unknown,
): { b64?: string; url?: string }[] {
  if (!json || typeof json !== "object") return [];
  if (!minimaxStatusOk(json)) return [];
  const root = json as {
    data?:
      | { b64_json?: string; url?: string }[]
      | { image_base64?: string[]; image_urls?: string[] };
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
