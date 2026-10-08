import { getRequest } from "@tanstack/react-start/server";
import { authConfigured } from "./wallet-auth.server";
export { authConfigured } from "./wallet-auth.server";
export const DEV_USER_ID = "dev-user";
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}
export type VerifiedUser = { id: string; email: string | null };
export async function getSessionUser(_bearerToken?: string): Promise<VerifiedUser | null> {
  const request = getRequest();
  if (!request) return null;
  const { sessionUserFromRequest } = await import("./wallet-auth-http.server");
  const session = await sessionUserFromRequest(request);
  return session ? { id: session.id, email: session.email } : null;
}
export async function requireUserId(bearerToken?: string) {
  if (!authConfigured) return DEV_USER_ID;
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
