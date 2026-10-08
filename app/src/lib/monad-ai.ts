/** Provider IDs verified against Monad Hub's feed and BlockRun's live /api/v1/models. */
export const BLOCKRUN_CHAT_URL = "https://blockrun.ai/api/v1/chat/completions";
export const BLOCKRUN_IMAGE_URL = "https://blockrun.ai/api/v1/images/generations";
export const MONAD_IMAGE_MODEL = "xai/grok-imagine-image-2.0";
export const MONAD_CHAT_MODEL = "xai/grok-4.3";
export const MONAD_MINIMAX_CHAT_MODEL = "minimax/minimax-m3";
export function monadChatPayload(
  body: Record<string, unknown>,
  model = MONAD_CHAT_MODEL,
): Record<string, unknown> {
  if (model !== MONAD_CHAT_MODEL && model !== MONAD_MINIMAX_CHAT_MODEL)
    throw new Error("Unsupported X402_CHAT_MODEL; use xai/grok-4.3 or minimax/minimax-m3");
  const { thinking: _thinking, reasoning_effort: _reasoning, stream: _stream, ...rest } = body;
  return {
    ...rest,
    model,
    stream: false,
    ...(model === MONAD_CHAT_MODEL
      ? { reasoning_effort: "none" }
      : { thinking: { type: "disabled" } }),
  };
}
export function monidRequest(url: string, body: Record<string, unknown>) {
  if (url === BLOCKRUN_CHAT_URL)
    return { provider: "blockrun.ai", endpoint: "/api/v1/chat/completions", input: { body } };
  if (url === BLOCKRUN_IMAGE_URL)
    return { provider: "blockrun.ai", endpoint: "/api/v1/images/generations", input: { body } };
  const parsed = new URL(url);
  if (
    parsed.origin === "https://api.minimax.cn" &&
    !parsed.search &&
    !parsed.hash &&
    ["/v1/t2a_v2", "/v1/image_generation"].includes(parsed.pathname)
  )
    return { provider: "minimax", endpoint: parsed.pathname, input: { body } };
  throw new Error("AI route is not available through Monad Hub");
}
