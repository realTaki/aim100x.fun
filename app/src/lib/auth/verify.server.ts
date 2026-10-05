import { getRequest } from "@tanstack/react-start/server";
import { gateIdentityEnabled } from "./gate-identity.server";
import { authConfigured, SESSION_TOKEN_COOKIE, verifySessionToken } from "./wallet-auth.server";

/**
 * Server-side session resolution from the client-held Passkey JWT (no database, no auth secret).
 */

export { authConfigured } from "./wallet-auth.server";

/** Dev fallback user id when auth is disabled. */
export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

function readBearer(headers: Headers): string | null {
  const header = headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function readCookie(headers: Headers, name: string): string | null {
  const raw = headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

async function tokenFromHeaders(headers: Headers, bearerToken?: string): Promise<string | null> {
  if (bearerToken) return bearerToken;
  return readBearer(headers) ?? readCookie(headers, SESSION_TOKEN_COOKIE);
}

export async function getSessionUser(
  bearerToken?: string,
): Promise<VerifiedUser | null> {
  if (!authConfigured && !gateIdentityEnabled()) return null;
  const request = getRequest();
  if (!request) return null;
  const token = await tokenFromHeaders(request.headers, bearerToken);
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  return { id: session.id, email: session.email };
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  if (!authConfigured && !gateIdentityEnabled()) {
    return DEV_USER_ID;
  }
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
