import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";
import { P256_N, WEBAUTHN_AUTH_ABI } from "@/lib/auth/passkey-aa";
import {
  bigintTo32Bytes,
  bytesToB64url,
  bytesToHex,
  hexToBytes,
} from "@/lib/auth/passkey-webauthn";
import { AGENT_WEBAUTHN_ORIGIN, AGENT_WEBAUTHN_RP_ID } from "@/lib/mcp/constants";

const P256_HALF_N = P256_N / 2n;

export type AgentWebAuthnKey = {
  privateKey: Hex;
  pubkeyX: bigint;
  pubkeyY: bigint;
};

function hex32(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function jwkBase64Url(value: Hex | Uint8Array): string {
  const bytes = typeof value === "string" ? hexToBytes(value) : value;
  return bytesToB64url(bytes);
}

async function sha256(data: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function importP256PrivateKey(key: AgentWebAuthnKey) {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: jwkBase64Url(key.privateKey),
    x: jwkBase64Url(hex32(key.pubkeyX)),
    y: jwkBase64Url(hex32(key.pubkeyY)),
    ext: true,
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function credentialIdFromPubkey(pubkeyX: bigint, pubkeyY: bigint): Promise<Hex> {
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(bigintTo32Bytes(pubkeyX), 1);
  uncompressed.set(bigintTo32Bytes(pubkeyY), 33);
  return bytesToHex(await sha256(uncompressed));
}

export async function authenticatorDataBytes(): Promise<Uint8Array> {
  const rpIdHash = await sha256(new TextEncoder().encode(AGENT_WEBAUTHN_RP_ID));
  const out = new Uint8Array(37);
  out.set(rpIdHash, 0);
  out[32] = 0x05;
  return out;
}

/** Build the same ABI envelope as PasskeyAccount. */
export async function signWebAuthn(key: AgentWebAuthnKey, userOpHash: Hex): Promise<Hex> {
  const challenge = bytesToB64url(hexToBytes(userOpHash));
  const clientDataJSON = JSON.stringify({
    type: "webauthn.get",
    challenge,
    origin: AGENT_WEBAUTHN_ORIGIN,
    crossOrigin: false,
  });
  const challengeIndex = clientDataJSON.indexOf('"challenge":');
  const typeIndex = clientDataJSON.indexOf('"type":');
  const authenticatorData = await authenticatorDataBytes();
  const clientHash = await sha256(new TextEncoder().encode(clientDataJSON));
  const signed = new Uint8Array(authenticatorData.length + clientHash.length);
  signed.set(authenticatorData, 0);
  signed.set(clientHash, authenticatorData.length);
  const cryptoKey = await importP256PrivateKey(key);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, signed),
  );
  const r = BigInt(bytesToHex(signature.subarray(0, 32)));
  const rawS = BigInt(bytesToHex(signature.subarray(32, 64)));
  const s = rawS > P256_HALF_N ? P256_N - rawS : rawS;
  return encodeAbiParameters(WEBAUTHN_AUTH_ABI, [
    {
      authenticatorData: bytesToHex(authenticatorData),
      clientDataJSON,
      challengeIndex: BigInt(challengeIndex),
      typeIndex: BigInt(typeIndex),
      r,
      s,
    },
  ]);
}

export function decodeWebAuthn(signature: Hex) {
  return decodeAbiParameters(WEBAUTHN_AUTH_ABI, signature);
}
