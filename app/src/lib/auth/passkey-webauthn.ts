export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToBytes(hex: string): Uint8Array {
  const raw = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (raw.length % 2 !== 0) throw new Error("hex");
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bigintTo32Bytes(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  return hexToBytes(hex);
}

export function bytesToBigint(bytes: Uint8Array): bigint {
  return BigInt(bytesToHex(bytes));
}

/** Matches contracts/src/libraries/Base64URL.sol (no padding). */
export function base64UrlEncode(data: Uint8Array): string {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const len = data.length;
  if (len === 0) return "";
  const pad = len % 3;
  let out = "";
  let i = 0;
  while (i + 3 <= len) {
    const n = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    out += table[(n >> 18) & 63];
    out += table[(n >> 12) & 63];
    out += table[(n >> 6) & 63];
    out += table[n & 63];
    i += 3;
  }
  if (pad === 2) {
    const n = (data[i]! << 16) | (data[i + 1]! << 8);
    out += table[(n >> 18) & 63];
    out += table[(n >> 12) & 63];
    out += table[(n >> 6) & 63];
  } else if (pad === 1) {
    const n = data[i]! << 16;
    out += table[(n >> 18) & 63];
    out += table[(n >> 12) & 63];
  }
  return out;
}

export function parseEcdsaDer(der: Uint8Array): { r: bigint; s: bigint } {
  if (der.length < 8 || der[0] !== 0x30) throw new Error("der");
  let i = 2;
  if (der[i] !== 0x02) throw new Error("der");
  const rLen = der[i + 1]!;
  i += 2;
  const rBytes = der.slice(i, i + rLen);
  i += rLen;
  if (der[i] !== 0x02) throw new Error("der");
  const sLen = der[i + 1]!;
  i += 2;
  const sBytes = der.slice(i, i + sLen);
  return { r: bytesToBigint(stripInt(rBytes)), s: bytesToBigint(stripInt(sBytes)) };
}

function stripInt(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
  return bytes.slice(i);
}

export function parseP256Spki(spki: Uint8Array): { x: bigint; y: bigint } {
  if (spki.length < 65) throw new Error("spki");
  const x = spki.slice(spki.length - 64, spki.length - 32);
  const y = spki.slice(spki.length - 32);
  return { x: bytesToBigint(x), y: bytesToBigint(y) };
}

type CborValue = number | bigint | Uint8Array | string | Map<CborValue, CborValue> | CborValue[];

function readCbor(data: Uint8Array, offset: number): { value: CborValue; offset: number } {
  const ib = data[offset]!;
  const major = ib >> 5;
  let additional = ib & 31;
  let i = offset + 1;
  if (additional === 24) {
    additional = data[i]!;
    i += 1;
  } else if (additional === 25) {
    additional = (data[i]! << 8) | data[i + 1]!;
    i += 2;
  } else if (additional === 26) {
    additional =
      (data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!;
    i += 4;
  }
  if (major === 0) return { value: additional, offset: i };
  if (major === 1) return { value: -1 - additional, offset: i };
  if (major === 2) {
    const value = data.slice(i, i + additional);
    return { value, offset: i + additional };
  }
  if (major === 3) {
    const value = new TextDecoder().decode(data.slice(i, i + additional));
    return { value, offset: i + additional };
  }
  if (major === 4) {
    const list: CborValue[] = [];
    for (let n = 0; n < additional; n++) {
      const next = readCbor(data, i);
      list.push(next.value);
      i = next.offset;
    }
    return { value: list, offset: i };
  }
  if (major === 5) {
    const map = new Map<CborValue, CborValue>();
    for (let n = 0; n < additional; n++) {
      const k = readCbor(data, i);
      const v = readCbor(data, k.offset);
      map.set(k.value, v.value);
      i = v.offset;
    }
    return { value: map, offset: i };
  }
  throw new Error("cbor");
}

export function parseCoseP256(cose: Uint8Array): { x: bigint; y: bigint } {
  const { value } = readCbor(cose, 0);
  if (!(value instanceof Map)) throw new Error("cose");
  const x = value.get(-2);
  const y = value.get(-3);
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error("cose");
  return { x: bytesToBigint(x), y: bytesToBigint(y) };
}

export function readCoseAuthData(attestationObject: Uint8Array): Uint8Array | null {
  try {
    const { value } = readCbor(attestationObject, 0);
    if (!(value instanceof Map)) return null;
    const authData = value.get("authData");
    return authData instanceof Uint8Array ? authData : null;
  } catch {
    return null;
  }
}

export function parseAttestedPubkey(authenticatorData: Uint8Array): { x: bigint; y: bigint } | null {
  if (authenticatorData.length < 37) return null;
  const flags = authenticatorData[32]!;
  if ((flags & 0x40) === 0) return null;
  const idLen = (authenticatorData[53]! << 8) | authenticatorData[54]!;
  const coseStart = 55 + idLen;
  if (coseStart >= authenticatorData.length) return null;
  try {
    return parseCoseP256(authenticatorData.slice(coseStart));
  } catch {
    return null;
  }
}

export function clientDataIndex(json: string, key: '"type":"' | '"challenge":"'): number {
  return json.indexOf(key);
}

export type PasskeyAssertion = {
  credentialId: Uint8Array;
  authenticatorData: Uint8Array;
  clientDataJSON: string;
  challengeIndex: number;
  typeIndex: number;
  r: bigint;
  s: bigint;
};

export function assertionFromGetResponse(cred: PublicKeyCredential): PasskeyAssertion {
  const response = cred.response as AuthenticatorAssertionResponse;
  const clientDataJSON = new TextDecoder().decode(new Uint8Array(response.clientDataJSON));
  const { r, s } = parseEcdsaDer(new Uint8Array(response.signature));
  return {
    credentialId: new Uint8Array(cred.rawId),
    authenticatorData: new Uint8Array(response.authenticatorData),
    clientDataJSON,
    challengeIndex: clientDataIndex(clientDataJSON, '"challenge":"'),
    typeIndex: clientDataIndex(clientDataJSON, '"type":"'),
    r,
    s,
  };
}

const WEBAUTHN_USER_NAME_MAX_BYTES = 64;

/** Prefix stored on the authenticator so OS/Chrome passkey lists group aim100x.fun accounts. */
export const PASSKEY_AUTHENTICATOR_NAME_PREFIX = "aim100x.fun - ";

function clipUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let out = "";
  for (const ch of Array.from(text)) {
    const next = out + ch;
    if (encoder.encode(next).length > maxBytes) break;
    out = next;
  }
  return out;
}

/**
 * WebAuthn `user.name` / `user.displayName` for signup `credentials.create()`.
 * In-app username stays the raw typed value; only the passkey record is prefixed.
 */
export function passkeyUserFromName(raw: string): { name: string; displayName: string } | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const labeled = clipUtf8(
    `${PASSKEY_AUTHENTICATOR_NAME_PREFIX}${trimmed}`,
    WEBAUTHN_USER_NAME_MAX_BYTES,
  ).trim();
  if (!labeled) return null;
  return { name: labeled, displayName: labeled };
}

/**
 * Sign-in `credentials.get()` — no `allowCredentials`, so the OS lists every RP passkey.
 * Do not set `authenticatorAttachment`: `"platform"` blocks Chrome password-manager
 * passkeys on machines without Windows Hello / Touch ID.
 */
export function passkeyDiscoverableRequest(
  challenge: BufferSource,
  rpId: string,
  allowCredentials?: PublicKeyCredentialDescriptor[],
): PublicKeyCredentialRequestOptions {
  return {
    challenge,
    rpId,
    userVerification: "required",
    timeout: 120_000,
    ...(allowCredentials?.length ? { allowCredentials } : {}),
  };
}

/**
 * Signup `credentials.create()`. Resident + UV required; attachment omitted so
 * Chrome can store the passkey in the password manager when there is no platform authenticator.
 */
export function passkeyCreateRequest(
  challenge: BufferSource,
  rpId: string,
  user: { id: BufferSource; name: string; displayName: string },
): PublicKeyCredentialCreationOptions {
  return {
    rp: { name: "aim100x.fun", id: rpId },
    user,
    challenge,
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
    timeout: 120_000,
    attestation: "none",
  };
}

/** WebAuthn `origin` never includes default ports; reverse proxies often do. */
export function canonicalWebauthnOrigin(origin: string): string {
  try {
    const u = new URL(origin.includes("://") ? origin : `https://${origin}`);
    const host = u.hostname.toLowerCase();
    if (u.protocol === "https:" && (u.port === "" || u.port === "443")) return `https://${host}`;
    if (u.protocol === "http:" && (u.port === "" || u.port === "80")) return `http://${host}`;
    return `${u.protocol}//${host}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return origin.trim().toLowerCase();
  }
}

export function webauthnOriginsMatch(a: string, b: string): boolean {
  return canonicalWebauthnOrigin(a) === canonicalWebauthnOrigin(b);
}

export function isLonelyfunsWebauthnOrigin(origin: string): boolean {
  try {
    const host = new URL(canonicalWebauthnOrigin(origin)).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "aim100x.fun" ||
      host === "lonelyfuns.grok.me" ||
      host.endsWith(".lonelyfuns.grok.me")
    );
  } catch {
    return false;
  }
}

export function b64urlLooseEqual(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return norm(a) === norm(b);
}

/** Exact challenge bytes — never pass a sliced Uint8Array's backing buffer. */
export function challengeBuffer(b64url: string): ArrayBuffer {
  const bytes = b64urlToBytes(b64url);
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}
