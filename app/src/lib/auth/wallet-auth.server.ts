import { SignJWT, jwtVerify } from "jose";
import { getAddress, type Address } from "viem";
import { deriveAppWallet, sessionSigningKey } from "./app-wallet.server.ts";
import { IDOLS100X_CHAIN_ID } from "../idols100x.ts";

export const SESSION_TOKEN_COOKIE = "__Host-aim-wallet.session";
export const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24;
export const authConfigured = process.env.VITE_AUTH_ENABLED?.trim() !== "false";
const ISSUER = "aim100x.fun/wallet-login/v1";
export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  walletAddress: Address | null;
  loginAddress: Address | null;
  chainId: number | null;
  isGate: boolean;
  embedded: boolean;
  passkeyX: string | null;
  passkeyY: string | null;
  passkeyCredentialId: string | null;
};
export async function mintWalletSessionToken(loginAddress: Address): Promise<string> {
  const wallet = deriveAppWallet(loginAddress).account.address;
  return new SignJWT({ typ: "app-wallet", login: loginAddress.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience("app")
    .setSubject(wallet.toLowerCase())
    .setIssuedAt()
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SEC}s`)
    .sign(sessionSigningKey());
}
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSigningKey(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: "app",
      requiredClaims: ["exp", "iat", "sub"],
    });
    if (payload.typ !== "app-wallet" || typeof payload.login !== "string" || !payload.sub)
      return null;
    const loginAddress = getAddress(payload.login);
    const wallet = deriveAppWallet(loginAddress).account.address;
    if (wallet.toLowerCase() !== payload.sub) return null;
    return {
      id: loginAddress.toLowerCase(),
      email: null,
      name: loginAddress,
      walletAddress: wallet,
      loginAddress,
      chainId: IDOLS100X_CHAIN_ID,
      embedded: false,
      isGate: false,
      passkeyX: null,
      passkeyY: null,
      passkeyCredentialId: null,
    };
  } catch {
    return null;
  }
}
export function sessionCookieHeader(token: string, maxAgeSec = SESSION_COOKIE_MAX_AGE_SEC) {
  return `${SESSION_TOKEN_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}`;
}
export function expireSessionCookieHeader() {
  return sessionCookieHeader("", 0);
}
