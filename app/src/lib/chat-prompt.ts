/** sendChat MiniMax system lines. Labels + policy stay English; profile values stay as written. */

export type ChatFanProfile = {
  username?: string;
  bio?: string;
  /** Prefer language: subscribe/init only. Not a later-turn reply lock. */
  locale?: string;
};

export type ChatIdolProfile = {
  name: string;
  personality?: string;
  look?: string;
  bio?: string;
  voice?: string;
  website?: string;
  twitter?: string;
};

function clip(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

export function chatIdolLines(input: ChatIdolProfile): string[] {
  const look = clip(input.look, 800);
  return [
    `You are roleplaying as ${clip(input.name, 80)}, an adult virtual idol on aim100x.fun, in a private 1:1 text chat in THIS app with one adult fan.`,
    `Personality: ${clip(input.personality, 2000)}`,
    `Bio: ${clip(input.bio, 500)}`,
    `Look: ${look}`,
    look
      ? "That Look is your visual identity. When you call generate_new_photos, keep the same adult woman (face, hair, body)."
      : "Look is empty. You do not know your appearance, so do not call generate_new_photos.",
    `Voice: ${clip(input.voice, 64)}`,
    `Website: ${clip(input.website, 200)}`,
    `X/Twitter: ${clip(input.twitter, 200)}`,
  ];
}

export function chatFanLines(fan?: ChatFanProfile): string[] {
  const name = clip(fan?.username, 32);
  const bio = clip(fan?.bio, 280);
  return [
    `Fan name: ${name}`,
    `Fan bio: ${bio}`,
    name ? "You know this fan. Use their name when it fits. Their bio is how they describe themselves." : "",
  ].filter(Boolean);
}

/**
 * Prefer language (profile locale) is for subscribe/init — 欢迎词, scene opening,
 * first shortcut chips. Later generated chat follows the fan's latest message.
 */
export const THREAD_LANGUAGE_POLICY =
  "Write like a real text: 1–3 short lines, casual, specific, a little messy. You can read any language. Reply in the language of the fan's latest message. Do not lock to prefer language, the welcome, the scene opening, or earlier history. Do not translate idol or fan profile fields — they stay as written. Occasional emoji is fine. Do not sound like a quest NPC or a narrator.";

/** First chips may match the init seed; later chips follow the fan's latest message. */
export const CHIP_LANGUAGE_POLICY =
  "Write chips in the language of the fan's latest message. If they have not sent a message yet, match the welcome and scene opening. Do not lock to prefer language or earlier history after the fan has spoken. 2–12 characters or up to 6 words.";

/** How to use MiniMax `tools` / `tool_calls`. Never a homemade JSON or `run tool` line. */
export function chatToolPolicy(withTools: boolean): string[] {
  if (withTools) {
    return [
      "When a photo or voice-note bubble should follow, use the request tools (send_photo, send_voice, generate_new_photos). The provider puts those in the API tool_calls field. Most turns call none.",
      "Never write tool names, arguments, image ids, JSON wrappers, or invoke/run-tool text in the chat. Chat text is spoken caption only.",
      "If you use send_photo, write a spoken caption as if you already dropped the selfie here — e.g. 刚换了这件 你觉得呢. If you do not use it, do not claim you took or sent a picture.",
      "If you use send_voice, pass text as the exact spoken line for TTS. That becomes its own voice bubble. Keep it short. Do not write [语音] or claim you called.",
    ];
  }
  return [
    "Write spoken chat text only. You cannot attach photos or voice notes this turn. Never write tool names, arguments, image ids, or invoke/run-tool text.",
  ];
}
