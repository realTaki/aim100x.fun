import { loadIdolByTokenId } from "@/lib/idol-catalog.server";
import {
  idolBio,
  idolLook,
  idolName,
  idolPersonality,
  idolTwitter,
  idolVoiceId,
  idolWebsite,
  sceneSetting,
  sceneTopic,
} from "@/lib/idol-fields";
import { sceneAt, sceneId } from "@/lib/idols";
import { hasHan } from "@/lib/utils";
import {
  CHAT_COMPLETION_TIMEOUT_MS,
  chatCompletionTimeoutSignal,
  decodeTtsAudio,
  isAiChatBodyOk,
  postChatCompletions,
  resolveAiBackend,
  resolveMiniMaxBackend,
  ttsRequest,
  type MiniMaxBackend,
} from "@/lib/ai-provider";
import { localePromptName } from "@/lib/locale";
import type { ChatTurnResult, ImageCandidate } from "@/lib/ai";
import {
  CHIP_LANGUAGE_POLICY,
  THREAD_LANGUAGE_POLICY,
  chatFanLines,
  chatIdolLines,
  chatToolPolicy,
  type ChatFanProfile,
} from "@/lib/chat-prompt";
import { isCannedShortcutChoices } from "@/lib/thread";
import { fanShortcutChoices, clipModelHistory, sanitizeIdolReply, userWantsPhoto } from "@/lib/chat-reply";
import {
  assistantTextContent,
  chatPhotoTools,
  parseChatToolCalls,
  resolveChatPhotoId,
} from "@/lib/chat-tools";

type HistoryMsg = { role: "user" | "assistant"; content: string };

function buildSystemPrompt(
  name: string,
  personality: string,
  look: string,
  bio: string,
  voice: string,
  website: string,
  twitter: string,
  chapterTitle: string,
  theme: string,
  fan: ChatFanProfile | undefined,
  withTools: boolean,
) {
  return [
    ...chatIdolLines({ name, personality, look, bio, voice, website, twitter }),
    ...chatFanLines(fan),
    `Current scene "${chapterTitle}": ${theme}. Stay in that scene.`,
    THREAD_LANGUAGE_POLICY,
    "This is an 18+ erotic dating-sim. Flirting, dirty talk, and explicit sexual roleplay are allowed and expected when the fan goes there. Follow their lead and intensity. Stay in character as a consenting adult.",
    "Never mention you are an AI or a language model. Never break character. Never involve minors.",
    "Never write stage directions, file labels, or fake attachments. Forbidden in reply: [图片], [照片], [photo], 【图片】, (发送图片), *sends a selfie*, or any bracket/action-tag. You cannot send files in text.",
    "This chat is the only channel. Never say you sent a photo on WeChat, iMessage, SMS, email, or any other app. Never tell them to check WeChat.",
    ...chatToolPolicy(withTools),
    "Do not suggest what the fan should say next. Do not include choices, options, or tap-to-send drafts.",
  ].join("\n");
}

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

export async function completeTurn(input: {
  tokenId: number;
  chapter: number;
  messages: HistoryMsg[];
  speak: boolean;
  lastChoices?: string[];
  imageCandidates?: ImageCandidate[];
  sceneId?: string;
  fanSentVoice?: boolean;
  completionTimeoutMs?: number;
  fan?: ChatFanProfile;
}): Promise<ChatTurnResult> {
  const idol = await loadIdolByTokenId(input.tokenId);
  if (!idol) return { ok: false, error: "Unknown idol" };

  const chapter = sceneAt(idol, input.chapter);
  if (!Object.keys(chapter).length) return { ok: false, error: "Unknown chapter" };

  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const userText = lastUser?.content ?? "";
  if (!userText.trim()) return { ok: false, error: "Empty message" };

  const backend = resolveAiBackend();
  if (!backend) return { ok: false, error: "ai_not_configured" };

  const history = clipModelHistory(input.messages);

  const unseen = (input.imageCandidates ?? []).map((c) => ({
    id: c.id,
    scene: c.scene,
    tags: c.tags.slice(0, 80),
    prompt: c.prompt.slice(0, 80),
  }));
  const turnMessages = (withTools: boolean) => [
    {
      role: "system" as const,
      content: [
        buildSystemPrompt(
          idolName(idol),
          idolPersonality(idol),
          idolLook(idol),
          idolBio(idol),
          idol.voice,
          idolWebsite(idol),
          idolTwitter(idol),
          sceneTopic(chapter),
          sceneSetting(chapter),
          input.fan,
          withTools,
        ),
        withTools && input.fanSentVoice
          ? "The fan just sent a voice note. You may use send_voice to reply in kind; do not always."
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    ...history,
  ];

  const completionMs = input.completionTimeoutMs ?? CHAT_COMPLETION_TIMEOUT_MS;
  const postTurn = (withTools: boolean) =>
    postChatCompletions(
      backend,
      {
        temperature: 0.95,
        max_tokens: 400,
        messages: turnMessages(withTools),
        ...(withTools ? { tools: chatPhotoTools(unseen) } : {}),
      },
      { signal: chatCompletionTimeoutSignal(completionMs) },
    );

  const timedOut = (err: unknown) =>
    Boolean(
      err &&
        typeof err === "object" &&
        "name" in err &&
        (err.name === "TimeoutError" || err.name === "AbortError"),
    );

  const readMessage = async (
    res: Response,
  ): Promise<{ message: unknown } | { error: string }> => {
    const text = await res.text().catch(() => "");
    let body: { choices?: { message?: unknown }[]; error?: { message?: unknown }; base_resp?: { status_msg?: unknown } } = {};
    try {
      body = text ? (JSON.parse(text) as typeof body) : {};
    } catch {
      if (!res.ok) {
        return { error: `${backend.kind} ${res.status}: ${text.replace(/\s+/g, " ").slice(0, 140)}` };
      }
      return { error: `${backend.kind} ${res.status}: invalid json` };
    }
    if (!res.ok || !isAiChatBodyOk(body)) {
      const detail = String(
        body.error?.message ?? body.base_resp?.status_msg ?? text.replace(/\s+/g, " "),
      ).slice(0, 140);
      return { error: `${backend.kind} ${res.status}: ${detail || "request failed"}` };
    }
    const message = body.choices?.[0]?.message;
    if (!message) return { error: `${backend.kind} ${res.status}: empty message` };
    return { message };
  };

  try {
    let lastError = "ai_request_failed";
    let message: unknown | null = null;
    try {
      const first = await readMessage(await postTurn(true));
      if ("message" in first) message = first.message;
      else lastError = first.error;
    } catch (err) {
      lastError = err instanceof Error ? err.message.slice(0, 160) : "tools request failed";
      if (timedOut(err)) return { ok: false, error: "ai_timeout" };
    }
    if (!message) {
      try {
        const second = await readMessage(await postTurn(false));
        if ("message" in second) message = second.message;
        else lastError = second.error;
      } catch (err) {
        if (timedOut(err)) return { ok: false, error: "ai_timeout" };
        lastError = err instanceof Error ? err.message.slice(0, 160) : lastError;
      }
    }
    if (!message) return { ok: false, error: lastError };

    const tools = parseChatToolCalls(message);
    const reply = sanitizeIdolReply(assistantTextContent(message)).slice(0, 180);
    const imageId = resolveChatPhotoId(
      tools.imageId,
      unseen.map((c) => c.id),
    );

    let audioBase64: string | undefined;
    if (input.speak && idolVoiceId(idol)) {
      const voiceBackend = resolveMiniMaxBackend();
      if (voiceBackend) audioBase64 = await ttsBase64(voiceBackend, reply, idolVoiceId(idol));
    }

    return {
      ok: true,
      reply,
      choices: [],
      imageId,
      audioBase64,
      sendPhoto: Boolean(imageId) || tools.sendPhoto || userWantsPhoto(userText),
      expandLibrary: tools.expandLibrary,
      photoPrompt: tools.photoPrompt,
      photoTags: tools.photoTags,
      sendVoice: tools.sendVoice,
      voiceText: tools.voiceText,
    };
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : "ai_request_failed";
    return { ok: false, error: detail.slice(0, 180) };
  }
}

export async function suggestChoices(input: {
  tokenId: number;
  chapter: number;
  messages: HistoryMsg[];
  lastChoices?: string[];
  fan?: ChatFanProfile;
}): Promise<string[]> {
  const idol = await loadIdolByTokenId(input.tokenId);
  if (!idol) return [];
  const chapter = sceneAt(idol, input.chapter);
  const backend = resolveAiBackend();
  if (!Object.keys(chapter ?? {}).length || !backend) return [];

  const history = input.messages
    .filter((m) => m.content.trim())
    .slice(-8)
    .map((m) => `${m.role === "assistant" ? "IDOL" : "FAN"}: ${m.content.slice(0, 280)}`)
    .join("\n");

  try {
    const writeChoice = async (approach: "gentle-progress" | "bold-progress") => {
      const direction =
        approach === "gentle-progress"
          ? "Gently move the interaction forward: interested, inviting, and flirtatious, without escalating too fast."
          : "Actively move the interaction forward: more direct, daring, and sexually forward while staying natural to the conversation.";
      const res = await postChatCompletions(
        backend,
        {
          temperature: 0.95,
          max_tokens: 60,
          messages: [
            {
              role: "system",
              content: [
                `You write one autocomplete message for the HUMAN FAN chatting with adult idol ${idolName(idol)}. You are NOT ${idolName(idol)}.`,
                ...chatFanLines(input.fan),
                `Scene: ${sceneSetting(chapter)}`,
                "Write one short FAN message to tap and send, in the fan's first person.",
                direction,
                "They are chatting on this app, not in the same place. It must work as a text: react to a photo, ask for another, flirt, or dirty talk. Never assume the fan is physically there.",
                "Never write as the idol. Return only the message: no JSON, list, label, quotation marks, or explanation.",
                CHIP_LANGUAGE_POLICY,
                input.lastChoices?.length ? `Do not reuse: ${input.lastChoices.join(" / ")}` : "",
              ].filter(Boolean).join("\n"),
            },
            { role: "user", content: history ? `CHAT:\n${history}` : "Write a FAN opening text." },
          ],
        },
        { signal: chatCompletionTimeoutSignal() },
      );
      if (!res.ok) return "";
      const body = (await res.json()) as { choices?: { message?: unknown }[] };
      return sanitizeIdolReply(assistantTextContent(body.choices?.[0]?.message)).slice(0, 120);
    };
    const choices = (
      await Promise.all([writeChoice("gentle-progress"), writeChoice("bold-progress")])
    ).filter(Boolean);
    const lastIdol =
      [...input.messages].reverse().find((m) => m.role === "assistant")?.content ?? "";
    const fan = fanShortcutChoices(choices, idolName(idol), lastIdol);
    return fan.length >= 2 && !isCannedShortcutChoices(fan) ? fan : [];
  } catch {
    return [];
  }
}

export async function localizeOpeningTexts(input: {
  opening: string;
  heading?: string;
  welcome?: string;
  locale: string;
  idolName: string;
}): Promise<{ opening: string; heading?: string; welcome?: string } | null> {
  const opening = input.opening.trim();
  const welcome = input.welcome?.trim() || "";
  if (!opening && !welcome) return null;
  const backend = resolveAiBackend();
  if (!backend) return null;
  const target = localePromptName(input.locale);

  const rewrite = async (text: string, kind: "welcome" | "opening" | "heading") => {
    if (!text) return "";
    const res = await postChatCompletions(
      backend,
      {
        temperature: 0.3,
        max_tokens: kind === "heading" ? 60 : 160,
        messages: [
          {
            role: "system",
            content: [
              `Rewrite this virtual idol ${kind} as ${input.idolName} in ${target}.`,
              kind === "heading"
                ? "Keep it short, like a chat section title."
                : "Keep the same meaning, tone, and 1–3 short chat lines. Do not add stage directions or photo tags.",
              "Return only the rewritten text. No JSON, labels, quotation marks, or explanation.",
            ].join("\n"),
          },
          { role: "user", content: text },
        ],
      },
      { signal: chatCompletionTimeoutSignal() },
    );
    if (!res.ok) return "";
    const body = (await res.json()) as { choices?: { message?: unknown }[] };
    return sanitizeIdolReply(assistantTextContent(body.choices?.[0]?.message));
  };

  try {
    const [nextOpening, nextWelcome, nextHeading] = await Promise.all([
      rewrite(opening, "opening"),
      rewrite(welcome, "welcome"),
      rewrite(input.heading?.trim() || "", "heading"),
    ]);
    if (!nextOpening && !nextWelcome) return null;
    return {
      opening: nextOpening || opening,
      heading: nextHeading || input.heading,
      welcome: nextWelcome || welcome || undefined,
    };
  } catch {
    return null;
  }
}
