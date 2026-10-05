/** Strip fake photo/stage-direction text the model sometimes writes into a chat bubble. */
export function sanitizeIdolReply(text: string): string {
  return text
    .replace(/\[(?:图片|照片|photo|image|pic|selfie|img)[^\]]*\]/gi, "")
    .replace(/【(?:图片|照片)[^\]]*】/g, "")
    .replace(/[（(]\s*(?:发送|送出|发一张|发了)?\s*(?:图片|照片|自拍|photo|image)[^)）]*[)）]/gi, "")
    .replace(/\*(?:sends?|sent|sending|drops?|dropped)[^*]{0,80}\*/gi, "")
    .replace(/^\s*(?:图片|照片)\s*[:：].*$/gim, "")
    .replace(
      /(?:我)?(?:已经|刚)?发(?:到|去|给)?你?(?:的)?(?:微信|WeChat|iMessage|短信|邮箱)了/gi,
      "",
    )
    .replace(/发你微信了/g, "")
    .replace(/记得(?:去)?(?:微信上)?看(?:一下|哦|哈)?[。.!！]?/g, "")
    .replace(/[,，]\s*[,，]/g, "，")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[,，。.\s]+|[,，\s]+$/g, "")
    .trim();
}

/** Model context window. Applied locally before upload, and again on the server. */
export const MODEL_HISTORY_LIMIT = 40;
export const MODEL_HISTORY_MAX_CHARS = 280;

export function clipModelHistory(
  messages: { role: string; content: string; error?: boolean }[],
): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && !m.error && m.content.trim())
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: sanitizeIdolReply(m.content.slice(0, MODEL_HISTORY_MAX_CHARS)),
    }))
    .filter((m) => m.content.trim())
    .slice(-MODEL_HISTORY_LIMIT);
}

export function userWantsPhoto(text: string): boolean {
  return /发(?:一)?张|拍(?:一)?张|再来一张|再发一张|发个自拍|发张照|看看照片|看你拍的|自拍来|照片来|\bselfie\b|\bnude\b|\bpic\b/i.test(
    text.trim(),
  );
}

const IDOL_VOICE_CHIP =
  /想看吗|给你看看?|发你看|我(?:刚)?拍了|刚拍了一组|这件衣服好看吗|好看吗\s*[~～啊呀嘛么]?\s*$|想你了哦|宝宝想不想/;

const IN_PERSON_CHIP =
  /过来抱抱|过来让我|过来擦|帮你擦|让我帮你|滴到.{0,6}身上|坐过来|到我身边|抱过来|伸手帮|擦干|递纸|递毛巾|come here|let me wipe/i;

/** Shortcut chips are tap-to-send drafts for the FAN, never lines the idol would say. */
export function isFanShortcutChoice(
  text: string,
  idolName: string,
  lastIdolReply = "",
): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (idolName && t.includes(idolName)) return false;
  const idol = lastIdolReply.trim();
  if (idol && (t === idol || (idol.includes(t) && t.length >= 6))) return false;
  if (IDOL_VOICE_CHIP.test(t)) return false;
  if (IN_PERSON_CHIP.test(t)) return false;
  if (/\b(?:want to see|check this out|I took (?:some )?photos?)\b/i.test(t)) return false;
  return true;
}

export function fanShortcutChoices(
  choices: string[],
  idolName: string,
  lastIdolReply = "",
): string[] {
  return choices.filter((c) => isFanShortcutChoice(c, idolName, lastIdolReply)).slice(0, 2);
}
