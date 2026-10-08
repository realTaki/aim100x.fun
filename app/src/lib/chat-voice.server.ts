import { resolveUserAiBackend } from "./ai-user.server.ts";
import { decodeTtsAudio, postAiRequest, ttsRequest } from "./ai-provider.ts";

/** Resolve the current Neon voice after authorization; never accept a client voice ID. */
export async function synthesizeChatVoice(
  input: { userId: string; tokenId: number; text: string; bearerToken?: string },
  deps = {
    loadIdolByTokenId: async (tokenId: number) =>
      (await import("./idol-config.server.ts")).readIdolConfig(tokenId),
    isFanMembershipActive: async (userId: string, tokenId: number, bearerToken?: string) =>
      (await import("./subscribe/fan-membership.server.ts")).isFanMembershipActive(
        userId,
        tokenId,
        bearerToken,
      ),
    resolveUserAiBackend,
    postAiRequest,
  },
): Promise<{ ok: true; audioBase64: string } | { ok: false }> {
  const text = input.text.trim().slice(0, 280);
  if (!Number.isSafeInteger(input.tokenId) || input.tokenId < 1 || !text) return { ok: false };
  if (!(await deps.isFanMembershipActive(input.userId, input.tokenId, input.bearerToken)))
    return { ok: false };
  const idol = await deps.loadIdolByTokenId(input.tokenId);
  const voiceId = idol?.voice.trim() ?? "";
  const backend = await deps.resolveUserAiBackend();
  if (!backend || !voiceId) return { ok: false };
  const request = ttsRequest(backend, text, voiceId, "auto");
  const response = await deps.postAiRequest(backend, request);
  if (!response.ok) return { ok: false };
  const audioBase64 = decodeTtsAudio(await response.json());
  return audioBase64 ? { ok: true, audioBase64 } : { ok: false };
}
