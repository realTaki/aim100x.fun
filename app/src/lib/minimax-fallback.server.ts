import type { AiBackend } from "./ai-provider.ts";
import { env } from "./env.server.ts";
import { UnpaidAiRequestError } from "./x402-payment.server.ts";

/** Temporary migration bridge. Remove its two call sites in ai-provider.ts to retire it. */
export async function withTemporaryMiniMaxFallback(
  primary: (signal: AbortSignal) => Promise<Response>,
  fallback: (backend: AiBackend, signal: AbortSignal) => Promise<Response>,
  options: {
    purpose: "chat" | "image";
    signal?: AbortSignal;
    usable: (body: unknown) => boolean;
  },
): Promise<Response> {
  const apiKey = env("MINIMAX_CN_API_KEY");
  if (env("AIM_TEMP_MINIMAX_FALLBACK") === "false" || !apiKey)
    return primary(options.signal ?? AbortSignal.timeout(45_000));

  const overall = options.signal ?? AbortSignal.timeout(45_000);
  let response: Response;
  try {
    response = await primary(AbortSignal.any([overall, AbortSignal.timeout(25_000)]));
  } catch (error) {
    // Unknown failures (including login and any submitted payment) must fail closed.
    if (!(error instanceof UnpaidAiRequestError) || overall.aborted) throw error;
    return runFallback();
  }
  // Monid preserves this header even when its provider fails after settlement.
  if (response.headers.has("PAYMENT-RESPONSE") || overall.aborted) return response;
  // An authentication/validation error is not a migration outage.
  if (!response.ok && ![402, 404, 408, 429, 500, 502, 503, 504].includes(response.status))
    return response;
  if (response.ok) {
    const usable = await response
      .clone()
      .json()
      .then(options.usable)
      .catch(() => false);
    if (usable) return response;
  }
  return runFallback();

  function runFallback() {
    overall.throwIfAborted();
    console.warn("ai.temporary_minimax_fallback", { purpose: options.purpose });
    // Exactly one direct MiniMax request, charged to the platform API key, not user USDC.
    return fallback(
      { kind: "minimax", apiKey: apiKey!, imageModel: "image-01" },
      AbortSignal.any([overall, AbortSignal.timeout(20_000)]),
    );
  }
}
