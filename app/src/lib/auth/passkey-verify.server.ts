import { createHmac, createHash, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { getAddress } from "viem";
import {
  b64urlToBytes,
  bigintTo32Bytes,
  bytesToB64url,
  bytesToHex,
  canonicalWebauthnOrigin,
  parseAttestedPubkey,
  parseEcdsaDer,
  parseP256Spki,
  webauthnOriginsMatch,
  b64urlLooseEqual,
  isLonelyfunsWebauthnOrigin,
} from "./passkey-webauthn.ts";
import { requestHostFromHeaders } from "./account-host.ts";

/** Stateless challenge MAC (not an env secret). WebAuthn still proves the passkey. */
const CHALLENGE_HMAC_KEY = new TextEncoder().encode("preview-passkey-challenge-secret");

type ChallengePayload = {
  n: string;
  e: number;
};

export function mintPasskeyChallenge(): { challenge: string; nonceToken: string } {
  const challenge = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  const payload: ChallengePayload = { n: challenge, e: Date.now() + 15 * 60 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", CHALLENGE_HMAC_KEY).update(body).digest("base64url");
  return { challenge, nonceToken: `${body}.${sig}` };
}

export function verifyPasskeyChallengeToken(token: string, challenge: string): boolean {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", CHALLENGE_HMAC_KEY).update(body).digest("base64url");
  try {
    if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
      return false;
    }
  } catch {
    return false;
  }
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChallengePayload;
  } catch {
    return false;
  }
  return payload.n === challenge && Date.now() < payload.e;
}

export function passkeyRpFromRequest(request: Request): { rpId: string; origin: string } {
  const url = new URL(request.url);
  const host =
    requestHostFromHeaders(request.headers) ??
    request.headers.get("host") ??
    url.host;
  const hostname = (host.split(":")[0] ?? host).toLowerCase();
  const proto = (request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", ""))
    .split(",")[0]!
    .trim()
    .toLowerCase();
  const fromBrowser = request.headers.get("origin") || request.headers.get("referer") || "";
  const origin = fromBrowser
    ? canonicalWebauthnOrigin(fromBrowser)
    : canonicalWebauthnOrigin(`${proto}://${host}`);
  return { rpId: hostname, origin };
}

function spkiFromXY(x: bigint, y: bigint): Buffer {
  return Buffer.concat([
    Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex"),
    Buffer.from([0x04]),
    Buffer.from(bigintTo32Bytes(x)),
    Buffer.from(bigintTo32Bytes(y)),
  ]);
}

export function verifyP256Sha256(
  signed: Uint8Array,
  r: bigint,
  s: bigint,
  x: bigint,
  y: bigint,
): boolean {
  try {
    const key = createPublicKey({ key: spkiFromXY(x, y), format: "der", type: "spki" });
    const sig = Buffer.concat([Buffer.from(bigintTo32Bytes(r)), Buffer.from(bigintTo32Bytes(s))]);
    return verify("SHA256", Buffer.from(signed), { key, dsaEncoding: "ieee-p1363" }, sig);
  } catch {
    return false;
  }
}

export type PasskeyVerifyBody = {
  nonceToken?: string;
  challenge?: string;
  mode?: "create" | "get";
  credentialId?: string;
  clientDataJSON?: string;
  authenticatorData?: string;
  signature?: string;
  publicKey?: string;
  x?: string;
  y?: string;
};

export function inspectClientData(
  clientDataJSON: string,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedType: "webauthn.create" | "webauthn.get",
): boolean {
  return inspectClientDataIssue(clientDataJSON, expectedChallenge, expectedOrigin, expectedType) === null;
}

export function inspectClientDataIssue(
  clientDataJSON: string,
  expectedChallenge: string,
  expectedOrigin: string,
  expectedType: "webauthn.create" | "webauthn.get",
): string | null {
  let parsed: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    parsed = JSON.parse(clientDataJSON) as typeof parsed;
  } catch {
    return "client_json";
  }
  if (parsed.type !== expectedType) return `type:${String(parsed.type)}`;
  if (typeof parsed.challenge !== "string" || !b64urlLooseEqual(parsed.challenge, expectedChallenge)) {
    return "challenge";
  }
  if (typeof parsed.origin !== "string") return "origin";
  if (
    webauthnOriginsMatch(parsed.origin, expectedOrigin) ||
    isLonelyfunsWebauthnOrigin(parsed.origin)
  ) {
    return null;
  }
  return `origin:${parsed.origin}`;
}

export function resolvePasskeyPub(
  body: PasskeyVerifyBody,
): { x: bigint; y: bigint; credentialId: Uint8Array } | null {
  if (!body.credentialId || !body.authenticatorData) return null;
  const credentialId = b64urlToBytes(body.credentialId);
  const authenticatorData = b64urlToBytes(body.authenticatorData);
  const fromAttested = parseAttestedPubkey(authenticatorData);
  if (fromAttested) return { ...fromAttested, credentialId };
  if (body.publicKey) {
    try {
      return { ...parseP256Spki(b64urlToBytes(body.publicKey)), credentialId };
    } catch {
      /* fall through to client xy */
    }
  }
  if (typeof body.x === "string" && typeof body.y === "string") {
    try {
      const x = BigInt(body.x);
      const y = BigInt(body.y);
      if (x > 0n && y > 0n) return { x, y, credentialId };
    } catch {
      return null;
    }
  }
  return null;
}

export function verifyPasskeyAssertion(input: {
  body: PasskeyVerifyBody;
  origin: string;
  challenge: string;
  x: bigint;
  y: bigint;
}): boolean {
  return verifyPasskeyAssertionIssue(input) === null;
}

export function verifyPasskeyAssertionIssue(input: {
  body: PasskeyVerifyBody;
  origin: string;
  challenge: string;
  x: bigint;
  y: bigint;
}): string | null {
  const { body, origin, challenge, x, y } = input;
  if (!body.clientDataJSON || !body.authenticatorData || !body.signature) return "assertion";
  const clientDataJSON = Buffer.from(b64urlToBytes(body.clientDataJSON)).toString("utf8");
  const clientIssue = inspectClientDataIssue(clientDataJSON, challenge, origin, "webauthn.get");
  if (clientIssue) return clientIssue;
  const authenticatorData = b64urlToBytes(body.authenticatorData);
  if (authenticatorData.length < 37) return "authdata";
  if ((authenticatorData[32]! & 0x01) !== 0x01) return "flags";
  let rs: { r: bigint; s: bigint };
  try {
    rs = parseEcdsaDer(b64urlToBytes(body.signature));
  } catch {
    return "der";
  }
  const clientHash = createHash("sha256").update(clientDataJSON).digest();
  const signed = Buffer.concat([Buffer.from(authenticatorData), clientHash]);
  if (!verifyP256Sha256(signed, rs.r, rs.s, x, y)) return "sig";
  return null;
}

export function checksumPasskeyAddress(address: string): `0x${string}` {
  return getAddress(address);
}

export function credentialIdHex(credentialId: Uint8Array): `0x${string}` {
  return bytesToHex(credentialId);
}
