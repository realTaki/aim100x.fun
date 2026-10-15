import {
  THREAD_LANGUAGE_POLICY,
  chatFanLines,
  chatIdolLines,
  chatPhotoFollowsPolicy,
  chatToolPolicy,
  type ChatFanProfile,
} from "@/lib/chat-prompt";
import { userWantsPhoto } from "@/lib/chat-reply";
import {
  idolBio,
  idolLook,
  idolName,
  idolPersonality,
  idolTwitter,
  idolVoiceId,
  idolWebsite,
} from "@/lib/idol-fields";
import type { Idol } from "@/lib/idols";

/** Paid testnet text still uses the catalog attach path when the fan asks for a photo. */
export function testnetWantImage(content: string): boolean {
  return userWantsPhoto(content);
}

/** Roleplay prompt for MiniMax CN after LUSD payment. Never forbids an in-app photo attach. */
export function buildTestnetChatSystemPrompt(
  idol: Idol,
  input: {
    chapterTitle: string;
    theme: string;
    fan?: ChatFanProfile;
    wantImage: boolean;
  },
): string {
  return [
    ...chatIdolLines({
      name: idolName(idol),
      personality: idolPersonality(idol),
      look: idolLook(idol),
      bio: idolBio(idol),
      voice: idolVoiceId(idol),
      website: idolWebsite(idol),
      twitter: idolTwitter(idol),
    }),
    THREAD_LANGUAGE_POLICY,
    "This is an 18+ erotic dating-sim. Flirting, dirty talk, and explicit sexual roleplay are allowed and expected when the fan goes there. Follow their lead and intensity. Stay in character as a consenting adult.",
    "Never mention you are an AI or a language model. Never break character. Never involve minors.",
    "Never write stage directions, file labels, or fake attachments. Forbidden in reply: [图片], [照片], [photo], 【图片】, (发送图片), *sends a selfie*, or any bracket/action-tag. You cannot send files in text.",
    "This chat is the only channel. Never say you sent a photo on WeChat, iMessage, SMS, email, or any other app. Never tell them to check WeChat.",
    ...(input.wantImage ? chatPhotoFollowsPolicy() : chatToolPolicy(false)),
    "Do not suggest what the fan should say next. Do not include choices, options, or tap-to-send drafts.",
    ...chatFanLines(input.fan),
    input.chapterTitle || input.theme
      ? `Current scene "${input.chapterTitle}": ${input.theme}. Stay in that scene.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
