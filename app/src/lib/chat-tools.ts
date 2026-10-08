import { normalizeMediaId } from "@/lib/media-app-id";

export const SEND_PHOTO_TOOL = "send_photo";
export const GENERATE_PHOTOS_TOOL = "generate_new_photos";
/** @deprecated old tool name; still parsed if a model emits it */
export const EXPAND_LIBRARY_TOOL = GENERATE_PHOTOS_TOOL;
export const SEND_VOICE_TOOL = "send_voice";

export type UnseenPhoto = {
  id: string;
  scene?: string;
  tags?: string;
  prompt?: string;
};

const GENERATE_NEW_PHOTOS_TOOL = {
  type: "function" as const,
  function: {
    name: GENERATE_PHOTOS_TOOL,
    description:
      "生成新图片: restock the shared catalog in the background (one new photo per job). Call only when the unseen send_photo list is empty or clearly missing this look. Do not call just because you sent a photo. Do not mention generation to the fan.",
    parameters: {
      type: "object",
      required: ["prompt"],
      properties: {
        prompt: {
          type: "string",
          description:
            "Complete image-generation prompt: adult appearance, outfit, setting, pose, mood, and vertical phone-photo style.",
        },
        tags: {
          type: "string",
          description: "Optional short comma-separated catalog tags.",
        },
      },
    },
  },
};

const SEND_VOICE_NOTE_TOOL = {
  type: "function" as const,
  function: {
    name: SEND_VOICE_TOOL,
    description:
      "Send a separate voice-note bubble. `text` is the exact words spoken in the recording (short, spoken). The written reply is a different bubble — do not rely on it being read aloud. Most turns should not call this. Do not mention calling, WeChat, or generating audio.",
    parameters: {
      type: "object",
      required: ["text"],
      properties: {
        text: {
          type: "string",
          description: "Spoken line for TTS, 1 short sentence. Not a stage direction.",
        },
      },
    },
  },
};

function sendPhotoTool(unseen: UnseenPhoto[]) {
  const lines = unseen.map((p) => {
    const meta = [p.scene, p.tags, p.prompt].filter((s) => s && String(s).trim()).join(" · ");
    return `- ${p.id}${meta ? `: ${meta.slice(0, 80)}` : ""}`;
  });
  return {
    type: "function" as const,
    function: {
      name: SEND_PHOTO_TOOL,
      description: [
        "Attach one UNSEEN photo as the next chat bubble. Only ids in this list — this fan has already seen the rest in this chat. Most turns should not call this. Photos appear in THIS chat only.",
        lines.join("\n"),
      ].join("\n"),
      parameters: {
        type: "object",
        required: ["image_id"],
        properties: {
          image_id: {
            type: "string",
            description:
              "Unseen photo id from the list in the tool description. Never invent an id.",
          },
        },
      },
    },
  };
}

/** `send_photo` is omitted when this fan has no unseen photos left. */
export function chatPhotoTools(
  unseen: UnseenPhoto[],
  options: { voiceEnabled?: boolean; generationEnabled?: boolean } = {},
) {
  const photos = unseen.filter((p) => p.id.trim()).slice(0, 24);
  const rest = [
    ...(options.generationEnabled === false ? [] : [GENERATE_NEW_PHOTOS_TOOL]),
    ...(options.voiceEnabled === false ? [] : [SEND_VOICE_NOTE_TOOL]),
  ];
  return photos.length > 0 ? [sendPhotoTool(photos), ...rest] : rest;
}

export type ChatToolDecision = {
  sendPhoto: boolean;
  expandLibrary: boolean;
  sendVoice: boolean;
  photoPrompt?: string;
  photoTags?: string;
  imageId?: string;
  voiceText?: string;
};

function toolNameOf(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const row = entry as {
    name?: unknown;
    function?: { name?: unknown };
  };
  if (typeof row.function?.name === "string") return row.function.name;
  if (typeof row.name === "string") return row.name;
  return "";
}

function toolArgsOf(entry: unknown): Record<string, unknown> {
  if (!entry || typeof entry !== "object") return {};
  const row = entry as {
    arguments?: unknown;
    function?: { arguments?: unknown };
  };
  const raw = row.function?.arguments ?? row.arguments;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function promptOf(args: Record<string, unknown>): string | undefined {
  const prompt = args.prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt.trim().slice(0, 800) : undefined;
}

function emptyDecision(): ChatToolDecision {
  return {
    sendPhoto: false,
    expandLibrary: false,
    sendVoice: false,
    photoPrompt: undefined,
    photoTags: undefined,
    imageId: undefined,
    voiceText: undefined,
  };
}

function applyNamedTool(d: ChatToolDecision, name: string, args: Record<string, unknown>): void {
  if (name === SEND_PHOTO_TOOL) {
    d.sendPhoto = true;
    d.photoPrompt = promptOf(args) ?? d.photoPrompt;
    const id = args.image_id ?? args.imageId;
    if (typeof id === "string" && id.trim()) d.imageId = id.trim();
  }
  if (name === GENERATE_PHOTOS_TOOL || name === "expand_photo_library") {
    d.expandLibrary = true;
    d.photoPrompt = promptOf(args) ?? d.photoPrompt;
    const tags = args.tags;
    if (typeof tags === "string" && tags.trim()) d.photoTags = tags.trim().slice(0, 160);
  }
  if (name === SEND_VOICE_TOOL) {
    const spoken = args.text ?? args.speech ?? args.line;
    if (typeof spoken === "string" && spoken.trim()) {
      d.sendVoice = true;
      d.voiceText = spoken.trim().slice(0, 280);
    }
  }
}

/** Grok sometimes writes `(using send_photo with id …)` instead of `tool_calls`. */
function narratedToolDecision(text: string): ChatToolDecision {
  const d = emptyDecision();
  if (!text) return d;
  const narrated =
    /[（(]\s*using\s+(send_photo|send_voice|generate_new_photos|expand_photo_library)\b([^)）]*)[)）]/gi;
  for (const match of text.matchAll(narrated)) {
    const name = match[1] ?? "";
    const rest = match[2] ?? "";
    if (name === SEND_PHOTO_TOOL) {
      const id = rest.match(/\b(?:id|image_id)\s*[:=]?\s*([0-9a-f-]{8,})/i)?.[1];
      applyNamedTool(d, name, id ? { image_id: id } : {});
    } else if (name === SEND_VOICE_TOOL) {
      const spoken = rest.match(/\b(?:text|id)\s*[:=]?\s*(.+)$/i)?.[1]?.trim();
      applyNamedTool(d, name, spoken ? { text: spoken } : {});
    } else {
      const prompt = rest.match(/\bprompt\s*[:=]?\s*(.+)$/i)?.[1]?.trim();
      applyNamedTool(d, name, prompt ? { prompt } : {});
    }
  }
  return d;
}

/** Read OpenAI `tool_calls` off a chat completion message. */
export function parseChatToolCalls(message: unknown): ChatToolDecision {
  if (!message || typeof message !== "object") return emptyDecision();
  const m = message as {
    tool_calls?: unknown;
    toolCalls?: unknown;
    function_call?: unknown;
    content?: unknown;
  };
  const d = emptyDecision();
  const entries: unknown[] = [];
  if (Array.isArray(m.tool_calls)) entries.push(...m.tool_calls);
  if (Array.isArray(m.toolCalls)) entries.push(...m.toolCalls);
  if (m.function_call) entries.push(m.function_call);
  for (const entry of entries) {
    applyNamedTool(d, toolNameOf(entry), toolArgsOf(entry));
  }
  if (!d.sendPhoto && !d.expandLibrary && !d.sendVoice) {
    const narrated = narratedToolDecision(assistantTextContent(message));
    if (narrated.sendPhoto || narrated.expandLibrary || narrated.sendVoice) return narrated;
  }
  return d;
}

export function hexMediaIdDistance(a: string, b: string): number | undefined {
  const x = normalizeMediaId(a);
  const y = normalizeMediaId(b);
  if (!/^[0-9a-f]{32}$/i.test(x) || !/^[0-9a-f]{32}$/i.test(y)) return undefined;
  let n = 0;
  for (let i = 0; i < 32; i += 1) if (x[i] !== y[i]) n += 1;
  return n;
}

const NEAR_DUP_HEX = 4;

/** Map a model `image_id` onto an unused catalog photo. Near-dup of used → skip. */
export function resolveChatPhotoId(
  emitted: string | undefined,
  unused: readonly string[],
): string | undefined {
  const unusedKeys = [...new Set(unused.map((id) => normalizeMediaId(id)).filter(Boolean))];
  if (unusedKeys.length === 0) return undefined;
  if (!emitted?.trim()) return undefined;
  const key = normalizeMediaId(emitted);
  if (unusedKeys.includes(key)) return key;
  let best: { id: string; d: number } | undefined;
  for (const id of unusedKeys) {
    const d = hexMediaIdDistance(key, id);
    if (d === undefined) continue;
    if (!best || d < best.d) best = { id, d };
  }
  if (best && best.d <= NEAR_DUP_HEX) return best.id;
  return undefined;
}

export function assistantTextContent(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "";
      }
      return "";
    })
    .join("");
}
