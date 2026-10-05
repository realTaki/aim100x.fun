/** Passkey smart-account sessions. State lives in the browser; the server stores nothing. */
import { SignJWT, decodeJwt } from "jose";
import { getAddress } from "viem";
import {
  accountEmailFor,
  formatAccountLabel,
} from "./account-host.ts";

export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";
/** Cookie lifetime only — browsers cap around 400 days. The JWT itself has no exp. */
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;
const GATE_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export const authConfigured = process.env.VITE_AUTH_ENABLED?.trim() !== "false";

/**
 * Compact-JWT wrap key only — not an auth secret and not read from env.
 * `verifySessionToken` decodes claims; the browser holds the session.
 */
const SESSION_WRAP_KEY = new TextEncoder().encode("lonelyfuns-passkey-session");

const WALLET_RE = /^0[xX][a-fA-F0-9]{40}$/;

function checksumAddress(raw: string): `0x${string}` {
  return getAddress(raw);
}

export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  walletAddress: `0x${string}` | null;
  chainId: number | null;
  isGate: boolean;
  embedded: boolean;
  passkeyX: string | null;
  passkeyY: string | null;
  passkeyCredentialId: string | null;
};

export async function mintPasskeySessionToken(input: {
  wallet: `0x${string}`;
  chainId: number;
  x: string;
  y: string;
  credentialId: string;
}): Promise<string> {
  return new SignJWT({
    typ: "passkey",
    chainId: input.chainId,
    px: input.x,
    py: input.y,
    cid: input.credentialId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(input.wallet.toLowerCase())
    .setIssuedAt()
    .sign(SESSION_WRAP_KEY);
}

export async function mintGateSessionToken(sub: string, name: string, email: string): Promise<string> {
  return new SignJWT({ typ: "gate", name, email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime(`${GATE_SESSION_MAX_AGE_SEC}s`)
    .sign(SESSION_WRAP_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const payload = decodeJwt(token) as {
      sub?: unknown;
      typ?: unknown;
      chainId?: unknown;
      name?: unknown;
      email?: unknown;
      px?: unknown;
      py?: unknown;
      cid?: unknown;
      exp?: unknown;
    };
    const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!sub) return null;
    const chainId =
      typeof payload.chainId === "number" && Number.isFinite(payload.chainId)
        ? payload.chainId
        : null;
    const name = typeof payload.name === "string" ? payload.name : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const passkeyX = typeof payload.px === "string" && payload.px.trim() ? payload.px.trim() : null;
    const passkeyY = typeof payload.py === "string" && payload.py.trim() ? payload.py.trim() : null;
    const passkeyCredentialId =
      typeof payload.cid === "string" && payload.cid.trim() ? payload.cid.trim() : null;

    if (
      payload.typ === "passkey" &&
      WALLET_RE.test(sub) &&
      passkeyX &&
      passkeyY &&
      passkeyCredentialId
    ) {
      const wallet = checksumAddress(sub);
      return {
        id: wallet.toLowerCase(),
        email: accountEmailFor(wallet),
        name: formatAccountLabel({ displayName: wallet }),
        walletAddress: wallet,
        chainId,
        isGate: false,
        embedded: true,
        passkeyX,
        passkeyY,
        passkeyCredentialId,
      };
    }
    // Gate tokens still honor exp (Grok identity is reminted on get-session).
    if (payload.typ === "gate" && typeof payload.exp === "number") {
      if (Math.floor(Date.now() / 1000) >= payload.exp) return null;
    }
    if (payload.typ === "gate") {
      return {
        id: sub,
        email,
        name,
        walletAddress: null,
        chainId: null,
        isGate: true,
        embedded: false,
        passkeyX: null,
        passkeyY: null,
        passkeyCredentialId: null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(
  token: string,
  maxAgeSec = SESSION_COOKIE_MAX_AGE_SEC,
): string {
  return `${SESSION_TOKEN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function expireSessionCookieHeader(): string {
  return `${SESSION_TOKEN_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}
