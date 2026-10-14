import { SignJWT, jwtVerify } from "jose";
import type { Address } from "viem";
import { deriveIdentityWallet, sessionSigningKey } from "./app-wallet.server.ts";
import { browserIdentity, accountIdFor, normalizeIdentity, type LoginIdentity } from "./identity.ts";
import { authStore, randomUUID, type AuthStore } from "./account-store.server.ts";
import { IDOLS100X_CHAIN_ID } from "../idols100x.ts";
export const SESSION_TOKEN_COOKIE = "__Host-aim-wallet.session";
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24;
export const authConfigured = process.env.VITE_AUTH_ENABLED?.trim() !== "false";
const ISSUER = "aim100x.fun/app-login/v2";
export type SessionUser = {
  /** Stable internal identity. Product authorization uses walletAddress explicitly. */
  id: string; identity: LoginIdentity; sessionId: string; authenticatedAt: number;
  email: string | null; name: string | null; walletAddress: Address;
  loginAddress: Address | null; chainId: number; isGate: boolean; embedded: boolean;
  passkeyX: string | null; passkeyY: string | null; passkeyCredentialId: string | null;
};
export async function mintWalletSessionToken(input: LoginIdentity | Address, store: AuthStore = authStore): Promise<string> {
  const identity = normalizeIdentity(typeof input === "string" ? browserIdentity(input) : input);
  const address = deriveIdentityWallet(identity).account.address;
  const account = await store.account(identity, address);
  const sessionId = randomUUID();
  await store.session(sessionId, account.id, Date.now() + SESSION_COOKIE_MAX_AGE_SEC * 1000);
  return new SignJWT({ typ: "app-wallet-v2", identity, wallet: address })
    .setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience("app")
    .setSubject(account.id).setJti(sessionId).setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SEC}s`).sign(sessionSigningKey());
}
export async function verifySessionToken(token: string, store: AuthStore = authStore): Promise<SessionUser | null> {
  try {
    const { payload: p } = await jwtVerify(token, sessionSigningKey(), {
      algorithms: ["HS256"], issuer: ISSUER, audience: "app", requiredClaims: ["exp", "iat", "sub", "jti"],
    });
    if (p.typ !== "app-wallet-v2" || !p.identity || typeof p.identity !== "object") return null;
    const identity = normalizeIdentity(p.identity as LoginIdentity);
    const wallet = deriveIdentityWallet(identity).account.address;
    if (p.sub !== accountIdFor(identity) || p.wallet !== wallet || !await store.active(p.jti!, p.sub!)) return null;
    await store.account(identity, wallet); // Fail closed on a stored derivation mismatch.
    return {
      id: p.sub!, identity, sessionId: p.jti!, authenticatedAt: p.iat!, email: null, name: wallet, walletAddress: wallet,
      loginAddress: identity.provider === "wallet" ? identity.subject as Address : null,
      chainId: IDOLS100X_CHAIN_ID, embedded: true, isGate: false,
      passkeyX: null, passkeyY: null, passkeyCredentialId: null,
    };
  } catch { return null; }
}
export function sessionCookieHeader(token: string, maxAgeSec = SESSION_COOKIE_MAX_AGE_SEC) {
  return `${SESSION_TOKEN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
}
export const expireSessionCookieHeader = () => sessionCookieHeader("", 0);
