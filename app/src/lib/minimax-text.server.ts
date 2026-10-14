import { chatCompletionPayload, chatCompletionUrl, isAiChatBodyOk } from "./ai-provider.ts";
/** Direct CN text only. No Hub, Monid, x402, image or speech fallback. */
export async function minimaxText(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  apiKey: string,
  send: typeof fetch = fetch,
) {
  const response = await send(chatCompletionUrl(), {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(
      chatCompletionPayload({
        messages,
        stream: false,
        max_completion_tokens: 600,
        temperature: 0.9,
      }),
    ),
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("MiniMax China text request failed");
  const body = await response.json();
  if (!isAiChatBodyOk(body)) throw new Error("MiniMax China text request failed");
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Empty MiniMax text reply");
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .slice(0, 4000);
}
