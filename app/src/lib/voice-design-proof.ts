import { loadPasskeyRecord } from "@/lib/auth/passkey-record";
import { b64urlToBytes, bytesToB64url } from "@/lib/auth/passkey-webauthn";

export type VoiceDesignPayload = {
  tokenId: number;
  prompt: string;
  previewText: string;
  issuedAt: number;
};

export type VoiceDesignProof = {
  credentialId: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
};

/** The exact signed request; server and browser must keep this representation identical. */
export function voiceDesignPayloadJson(payload: VoiceDesignPayload): string {
  return JSON.stringify({ v: 1, ...payload });
}

async function challengeFor(payload: VoiceDesignPayload): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(voiceDesignPayloadJson(payload)));
}

/** A fresh WebAuthn assertion binds a paid voice-design request to the NFT owner's passkey. */
export async function signVoiceDesign(payload: VoiceDesignPayload): Promise<VoiceDesignProof> {
  const record = loadPasskeyRecord();
  if (!record) throw new Error("请先使用通行密钥验证");
  const challenge = await challengeFor(payload);
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      userVerification: "required",
      allowCredentials: [{ type: "public-key", id: b64urlToBytes(record.credentialId).buffer as ArrayBuffer }],
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("通行密钥验证已取消");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credentialId: bytesToB64url(new Uint8Array(credential.rawId)),
    clientDataJSON: bytesToB64url(new Uint8Array(response.clientDataJSON)),
    authenticatorData: bytesToB64url(new Uint8Array(response.authenticatorData)),
    signature: bytesToB64url(new Uint8Array(response.signature)),
  };
}
