import { getRequest } from "@tanstack/react-start/server";
import { sessionUserFromRequest } from "./auth/wallet-auth-http.server.ts";
import { boundAppWallet } from "./auth/app-wallet.server.ts";
import { env } from "./env.server.ts";
import { postMonidApi } from "./monid-api.server.ts";
import type { AiBackend } from "./ai-provider.ts";

export async function resolveUserAiBackend(): Promise<AiBackend> {
  const request = getRequest();
  const session = request ? await sessionUserFromRequest(request) : null;
  if (!session) throw new Error("Wallet login required for paid AI");
  return {
    kind: "x402",
    apiKey: "",
    imageModel: env("X402_IMAGE_MODEL"),
    identity: session.identity,
    walletAddress: session.walletAddress!,
  };
}
export function backendWallet(backend: AiBackend) {
  if (backend.kind !== "x402" || !backend.identity || !backend.walletAddress)
    throw new Error("Wallet login required");
  return boundAppWallet({
    identity: backend.identity,
    walletAddress: backend.walletAddress,
  }).account;
}
export async function postPaidAi(
  backend: AiBackend,
  url: string,
  body: Record<string, unknown>,
  init?: { signal?: AbortSignal },
) {
  const owner = backendWallet(backend);
  const signal = init?.signal ?? AbortSignal.timeout(45_000);
  return postMonidApi(owner, url, body, signal);
}
