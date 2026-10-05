import { createHash } from "node:crypto";
import type { Hex } from "viem";
import { verifyP256Sha256 } from "@/lib/auth/passkey-verify.server";
import { bytesToB64url, hexToBytes } from "@/lib/auth/passkey-webauthn";
import { AGENT_WEBAUTHN_ORIGIN, AGENT_WEBAUTHN_RP_ID } from "@/lib/mcp/constants";
import { decodeWebAuthn } from "@/lib/mcp/envelope";

export function verifyWebAuthn(
  signature: Hex,
  userOpHash: Hex,
  pubkeyX: bigint,
  pubkeyY: bigint,
): boolean {
  try {
    const [auth] = decodeWebAuthn(signature);
    const challenge = bytesToB64url(hexToBytes(userOpHash));
    let parsed: { type?: unknown; challenge?: unknown; origin?: unknown };
    try {
      parsed = JSON.parse(auth.clientDataJSON) as typeof parsed;
    } catch {
      return false;
    }
    if (parsed.type !== "webauthn.get") return false;
    if (typeof parsed.challenge !== "string" || parsed.challenge !== challenge) return false;
    if (parsed.origin !== AGENT_WEBAUTHN_ORIGIN) return false;
    if (auth.challengeIndex !== BigInt(auth.clientDataJSON.indexOf('"challenge":'))) return false;
    if (auth.typeIndex !== BigInt(auth.clientDataJSON.indexOf('"type":'))) return false;
    const authenticatorData = hexToBytes(auth.authenticatorData);
    const expectedRpIdHash = createHash("sha256").update(AGENT_WEBAUTHN_RP_ID).digest();
    if (
      authenticatorData.length !== 37 ||
      !expectedRpIdHash.equals(Buffer.from(authenticatorData.subarray(0, 32)))
    ) {
      return false;
    }
    const clientHash = createHash("sha256").update(auth.clientDataJSON).digest();
    const signed = Buffer.concat([Buffer.from(authenticatorData), clientHash]);
    return verifyP256Sha256(signed, auth.r, auth.s, pubkeyX, pubkeyY);
  } catch {
    return false;
  }
}
