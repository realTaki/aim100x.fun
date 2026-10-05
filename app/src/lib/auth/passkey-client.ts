import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import { PASSKEY_SESSION_ID, isPasskeySessionId } from "./passkey-aa";
import {
  findPasskeyRecord,
  loadPasskeyRecord,
  savePasskeyRecord,
  type PasskeyRecord,
} from "./passkey-record";
import { executePasskeyCalls, type PasskeyCall } from "./passkey-userop";
import { readPersistedWalletSession } from "./wallet-session";
import {
  assertionFromGetResponse,
  b64urlToBytes,
  bytesToB64url,
  bytesToHex,
  parseAttestedPubkey,
  parseP256Spki,
  passkeyCreateRequest,
  passkeyDiscoverableRequest,
  passkeyUserFromName,
  readCoseAuthData,
  challengeBuffer,
} from "./passkey-webauthn";
import {
  IDOLS100X_ADDRESS,
  IDOLS100X_FAN_ABI,
  IDOLS100X_IDOL_ABI,
  MONAD_TESTNET_USDC,
} from "@/lib/idols100x";
import { LONELY_USD_ABI } from "@/lib/lonely-usd";

export { executePasskeyCalls, PASSKEY_SESSION_ID };
export type { PasskeyCall, PasskeyRecord };

export function isPasskeyClientSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const persisted = readPersistedWalletSession(window.localStorage, window.sessionStorage);
    return isPasskeySessionId(persisted.walletId);
  } catch {
    return Boolean(loadPasskeyRecord());
  }
}

function rpId(): string {
  return window.location.hostname;
}

function hexPad(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function xyPayload(x: bigint, y: bigint) {
  return { x: bytesToHex(hexPad(x)), y: bytesToHex(hexPad(y)) };
}

async function createPasskey(challenge: ArrayBuffer, userName: string) {
  const user = passkeyUserFromName(userName);
  if (!user) throw new Error("passkey");
  const userId = crypto.getRandomValues(new Uint8Array(32));
  const cred = (await navigator.credentials.create({
    publicKey: passkeyCreateRequest(challenge, rpId(), {
      id: userId,
      name: user.name,
      displayName: user.displayName,
    }),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey");
  const att = cred.response as AuthenticatorAttestationResponse;
  let authenticatorData = new Uint8Array(0);
  try {
    if (typeof att.getAuthenticatorData === "function") {
      authenticatorData = new Uint8Array(att.getAuthenticatorData());
    }
  } catch {
    authenticatorData = new Uint8Array(0);
  }
  if (authenticatorData.length < 37) {
    const fromAttestation = readCoseAuthData(new Uint8Array(att.attestationObject));
    if (fromAttestation) authenticatorData = new Uint8Array(fromAttestation);
  }
  let parsed = authenticatorData.length ? parseAttestedPubkey(authenticatorData) : null;
  if (!parsed && typeof att.getPublicKey === "function") {
    const spki = att.getPublicKey();
    if (spki) parsed = parseP256Spki(new Uint8Array(spki));
  }
  if (!parsed) throw new Error("passkey");
  return {
    mode: "create" as const,
    credentialId: bytesToB64url(new Uint8Array(cred.rawId)),
    clientDataJSON: bytesToB64url(new Uint8Array(att.clientDataJSON)),
    authenticatorData: bytesToB64url(authenticatorData),
    publicKey:
      typeof att.getPublicKey === "function" && att.getPublicKey()
        ? bytesToB64url(new Uint8Array(att.getPublicKey()!))
        : undefined,
    ...xyPayload(parsed.x, parsed.y),
  };
}

async function getPasskey(challenge: ArrayBuffer) {
  const cred = (await navigator.credentials.get({
    publicKey: passkeyDiscoverableRequest(challenge, rpId()),
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("passkey");
  const assertion = assertionFromGetResponse(cred);
  const att = cred.response as AuthenticatorAssertionResponse;
  const credentialId = bytesToB64url(assertion.credentialId);
  const stored = findPasskeyRecord(credentialId);
  if (!stored?.x || !stored?.y) {
    throw new Error("unknown_passkey");
  }
  return {
    mode: "get" as const,
    credentialId,
    clientDataJSON: bytesToB64url(new Uint8Array(att.clientDataJSON)),
    authenticatorData: bytesToB64url(assertion.authenticatorData),
    signature: bytesToB64url(new Uint8Array(att.signature)),
    x: stored.x,
    y: stored.y,
  };
}

type ChallengeCache = {
  challenge: string;
  nonceToken: string;
  bytes: ArrayBuffer;
};

let challengeCache: ChallengeCache | null = null;
let challengeInflight: Promise<ChallengeCache> | null = null;

async function readAuthJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.includes("Continue with Grok") || res.status === 401) {
      throw new Error("grok_gate");
    }
    throw new Error("passkey_http");
  }
}

async function fetchPasskeyChallenge(): Promise<ChallengeCache> {
  const challengeRes = await fetch("/api/auth/passkey/challenge", {
    method: "POST",
    credentials: "include",
  });
  const challengeBody = (await readAuthJson(challengeRes)) as {
    challenge?: string;
    nonceToken?: string;
    error?: string;
  };
  if (!challengeRes.ok || !challengeBody.challenge || !challengeBody.nonceToken) {
    throw new Error(challengeBody.error ?? "passkey");
  }
  return {
    challenge: challengeBody.challenge,
    nonceToken: challengeBody.nonceToken,
    bytes: challengeBuffer(challengeBody.challenge),
  };
}

/** Warm the WebAuthn challenge so a click can call credentials.get immediately. */
export function prefetchPasskeyChallenge(): Promise<void> {
  if (challengeCache) return Promise.resolve();
  if (!challengeInflight) {
    challengeInflight = fetchPasskeyChallenge()
      .then((cached) => {
        challengeCache = cached;
        return cached;
      })
      .finally(() => {
        challengeInflight = null;
      });
  }
  return challengeInflight.then(() => undefined);
}

export function hasPrefetchedPasskeyChallenge(): boolean {
  return challengeCache != null;
}

async function takePasskeyChallenge(): Promise<ChallengeCache> {
  if (challengeCache) {
    const cached = challengeCache;
    challengeCache = null;
    return cached;
  }
  if (challengeInflight) return challengeInflight.then((cached) => {
    if (challengeCache === cached) challengeCache = null;
    return cached;
  });
  return fetchPasskeyChallenge();
}

export async function requestPasskeySession(opts?: { createName?: string }): Promise<{
  token: string;
  record: PasskeyRecord;
}> {
  const createName = opts?.createName;
  if (createName !== undefined && !passkeyUserFromName(createName)) {
    throw new Error("passkey");
  }
  const challengeBody = await takePasskeyChallenge();
  const payload =
    createName !== undefined
      ? await createPasskey(challengeBody.bytes, createName)
      : await getPasskey(challengeBody.bytes);

  if (createName !== undefined && payload.mode === "create") {
    savePasskeyRecord({
      address: "0x0000000000000000000000000000000000000001",
      credentialId: payload.credentialId,
      x: payload.x as `0x${string}`,
      y: payload.y as `0x${string}`,
      username: createName.trim().slice(0, 32),
    });
  }

  const verifyRes = await fetch("/api/auth/passkey/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nonceToken: challengeBody.nonceToken,
      challenge: challengeBody.challenge,
      ...payload,
    }),
  });
  const verifyBody = (await readAuthJson(verifyRes)) as {
    token?: string;
    address?: string;
    x?: string;
    y?: string;
    credentialId?: string;
    error?: string;
    reason?: string;
  };
  if (
    !verifyRes.ok ||
    !verifyBody.token ||
    !verifyBody.address ||
    !verifyBody.x ||
    !verifyBody.y ||
    !verifyBody.credentialId
  ) {
    const reason = verifyBody.reason ? ` ${verifyBody.reason}` : "";
    throw new Error(`${verifyBody.error ?? "passkey"}${reason}`);
  }
  const record: PasskeyRecord = {
    address: verifyBody.address as `0x${string}`,
    credentialId: verifyBody.credentialId,
    x: verifyBody.x as `0x${string}`,
    y: verifyBody.y as `0x${string}`,
    ...(createName?.trim() ? { username: createName.trim().slice(0, 32) } : {}),
  };
  savePasskeyRecord(record);
  return { token: verifyBody.token, record };
}

const ERC6551_EXECUTE_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
    ],
    outputs: [{ name: "result", type: "bytes" }],
  },
] as const;

function approveUsdc(amount: bigint): PasskeyCall {
  return {
    to: MONAD_TESTNET_USDC,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [IDOLS100X_ADDRESS, amount],
    }),
  };
}

/** Smart-account `execute` so faucet cooldown is the Passkey account, not the bundler. */
export async function passkeyFaucet(): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: MONAD_TESTNET_USDC,
      data: encodeFunctionData({
        abi: LONELY_USD_ABI,
        functionName: "faucet",
      }),
    },
  ]);
}

export async function passkeySubscribe(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_FAN_ABI,
        functionName: "subscribe",
        args: [BigInt(tokenId)],
      }),
    },
  ]);
}

export async function passkeyPay(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_FAN_ABI,
        functionName: "pay",
        args: [BigInt(tokenId), amount],
      }),
    },
  ]);
}

export async function passkeyMint(amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "mint",
      }),
    },
  ]);
}

export async function passkeyBuy(tokenId: number, amount: bigint): Promise<Hex> {
  return executePasskeyCalls([
    approveUsdc(amount),
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "buy",
        args: [BigInt(tokenId)],
      }),
    },
  ]);
}

export async function passkeySetSalePrice(tokenId: number, price: bigint): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setSalePrice",
        args: [BigInt(tokenId), price],
      }),
    },
  ]);
}

export async function passkeySetPublic(tokenId: number, isPublic: boolean): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setPublic",
        args: [BigInt(tokenId), isPublic],
      }),
    },
  ]);
}

/** Authorize one ERC-4337 Agent Account for every idol owned by this account. */
export async function passkeySetAgent(agent: Address, role: 1 | 2): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setAgent",
        args: [agent, role],
      }),
    },
  ]);
}

/** Revoke the current Agent Account for every idol owned by this account. */
export async function passkeyRemoveAgent(): Promise<Hex> {
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "removeAgent",
      }),
    },
  ]);
}

export async function passkeySetIdolFields(
  tokenId: number,
  fields: {
    name: string;
    bio: string;
    personality: string;
    look: string;
    voice: string;
    website: string;
    twitter: string;
    scenes: string;
    welcome: string;
    subscribePriceUsdc: bigint;
    imageUnlockPriceUsdc: bigint;
  },
): Promise<Hex> {
  const token = BigInt(tokenId);
  return executePasskeyCalls([
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setIdolContent",
        args: [
          token,
          {
            name: fields.name,
            bio: fields.bio,
            personality: fields.personality,
            look: fields.look,
            voice: fields.voice,
            website: fields.website,
            twitter: fields.twitter,
            scenes: fields.scenes,
          },
        ],
      }),
    },
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setIdolPricing",
        args: [
          token,
          {
            subscribePriceUsdc: fields.subscribePriceUsdc,
            imageUnlockPriceUsdc: fields.imageUnlockPriceUsdc,
          },
        ],
      }),
    },
    {
      to: IDOLS100X_ADDRESS,
      data: encodeFunctionData({
        abi: IDOLS100X_IDOL_ABI,
        functionName: "setWelcome",
        args: [token, fields.welcome],
      }),
    },
  ]);
}

export async function passkeyWithdrawTba(
  tba: Address,
  to: Address,
  amount: bigint,
): Promise<Hex> {
  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
  return executePasskeyCalls([
    {
      to: tba,
      data: encodeFunctionData({
        abi: ERC6551_EXECUTE_ABI,
        functionName: "execute",
        args: [MONAD_TESTNET_USDC, 0n, transferData, 0],
      }),
    },
  ]);
}
