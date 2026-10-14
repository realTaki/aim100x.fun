import { monadTransport } from "../monad-rpc.ts";
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { createPublicClient, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";
import { boundAppWallet, sessionSigningKey } from "./app-wallet.server.ts";
import { ensureAppWalletDelegation } from "./app-wallet-executor.server.ts";
import { mainnetWalletChain, testnetWalletChain, MONAD_USDC } from "./app-wallet-chain.ts";
import { authStore, type AuthStore } from "./account-store.server.ts";
import { verifyPrivyIdentity } from "./privy.server.ts";
import type { LoginIdentity, LoginProvider } from "./identity.ts";
import { authConfigured, expireSessionCookieHeader, mintWalletSessionToken, SESSION_TOKEN_COOKIE, sessionCookieHeader, verifySessionToken, type SessionUser } from "./wallet-auth.server.ts";
const CHALLENGE_COOKIE = "__Host-aim-wallet.challenge";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
function json(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}
function cookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="))?.slice(name.length + 1) ?? null;
}
const challengeCookie = (token: string, age = 300) => `${CHALLENGE_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
export function isSameOriginWalletRequest(request: Request) {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  return (!site || site === "same-origin" || site === "none") && (!origin || origin === new URL(request.url).origin);
}
export async function sessionUserFromRequest(request: Request, store: AuthStore = authStore) {
  const token = cookie(request, SESSION_TOKEN_COOKIE);
  return token ? verifySessionToken(token, store) : null;
}
export type AuthDeps = {
  store?: AuthStore;
  verifySignature?: (message: string, signature: Hex, address: Address, domain: string) => Promise<boolean>;
  verifyPrivy?: typeof verifyPrivyIdentity;
  execute?: (user: SessionUser, input: unknown) => Promise<unknown>;
};
export async function handleWalletAuthRequest(request: Request, deps: AuthDeps = {}): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.replace(/^\/api\/auth\/?/, "");
  const store = deps.store ?? authStore;
  if (!isSameOriginWalletRequest(request) || (request.method === "POST" && request.headers.get("origin") !== url.origin))
    return json({ error: "Same-origin request required" }, 403);
  try {
    if (path === "sign-out" && request.method === "POST") {
      const user = await sessionUserFromRequest(request, store);
      if (user) await store.revoke(user.sessionId);
      return json({ success: true }, 200, [expireSessionCookieHeader(), challengeCookie("", 0)]);
    }
    if (!authConfigured) return json({ error: "Login is disabled" }, 503);
    if (path === "wallet/challenge" && request.method === "POST") {
      const body = await request.json();
      const provider: LoginProvider = body.provider ?? "wallet";
      if (!["wallet", "mera", "privy"].includes(provider)) return json({ error: "Invalid provider" }, 400);
      let issuer = provider === "wallet" ? "eip155" : provider === "mera" ? process.env.MERA_RP_ID : process.env.PRIVY_APP_ID;
      if (!issuer || (provider === "mera" && url.hostname !== issuer && !url.hostname.endsWith("." + issuer)))
        return json({ error: "Login provider is not configured for this origin" }, 503);
      if (provider === "privy") issuer = `privy.io/${issuer}`;
      const nonce = randomBytes(32).toString("hex");
      let message = nonce;
      if (provider !== "privy") {
        if (typeof body.address !== "string" || !/^0x[a-f0-9]{40}$/i.test(body.address)) return json({ error: "Invalid identity" }, 400);
        message = createSiweMessage({
          address: getAddress(body.address.toLowerCase()), chainId: testnetWalletChain.id, domain: url.host, uri: url.origin,
          version: "1", nonce, issuedAt: new Date(), expirationTime: new Date(Date.now() + 300_000),
          statement: `Sign in to aim100x.fun using ${provider}. This identity has its own independent server-controlled APP wallet. This signature is for login only.`,
        });
      }
      await store.challenge(nonce, digest(JSON.stringify([provider, issuer, message])), Date.now() + 300_000);
      const token = await new SignJWT({ provider, issuer, message }).setProtectedHeader({ alg: "HS256" })
        .setIssuer("aim100x.fun/login-challenge/v2").setAudience(url.origin).setJti(nonce).setIssuedAt().setExpirationTime("5m").sign(sessionSigningKey());
      return json({ message, provider }, 200, [challengeCookie(token)]);
    }
    if (path === "wallet/verify" && request.method === "POST") {
      const body = await request.json(), token = cookie(request, CHALLENGE_COOKIE);
      if (!token || typeof body.message !== "string" || body.message.length > 10000) return json({ error: "Invalid login challenge" }, 401);
      try {
        const { payload: p } = await jwtVerify(token, sessionSigningKey(), { algorithms: ["HS256"], issuer: "aim100x.fun/login-challenge/v2", audience: url.origin, requiredClaims: ["exp", "jti"] });
        if (p.message !== body.message || typeof p.issuer !== "string") throw new Error();
        let identity: LoginIdentity;
        if (p.provider === "privy") {
          if (typeof body.accessToken !== "string" || body.accessToken.length > 16000) throw new Error();
          identity = await (deps.verifyPrivy ?? verifyPrivyIdentity)(body.accessToken);
          if (identity.provider !== "privy" || identity.issuer !== p.issuer) throw new Error();
        } else {
          if (p.provider !== "wallet" && p.provider !== "mera") throw new Error();
          if (typeof body.signature !== "string" || !/^0x[a-f0-9]+$/i.test(body.signature) || body.signature.length > 8192) throw new Error();
          const parsed = parseSiweMessage(body.message);
          if (!parsed.address || parsed.domain !== url.host || parsed.uri !== url.origin || parsed.chainId !== testnetWalletChain.id || parsed.nonce !== p.jti) throw new Error();
          const reader = createPublicClient({ chain: testnetWalletChain, transport: monadTransport(testnetWalletChain.id) });
          const valid = deps.verifySignature ? await deps.verifySignature(body.message, body.signature, parsed.address, url.host)
            : await reader.verifySiweMessage({ message: body.message, signature: body.signature, address: parsed.address, domain: url.host });
          if (!valid) throw new Error();
          identity = { provider: p.provider, issuer: p.issuer, subject: parsed.address };
        }
        if (!await store.consume(p.jti!, digest(JSON.stringify([p.provider, p.issuer, p.message])))) throw new Error();
        const session = await mintWalletSessionToken(identity, store);
        const user = await verifySessionToken(session, store);
        return json({ user }, 200, [sessionCookieHeader(session), challengeCookie("", 0)]);
      } catch { return json({ error: "Login proof invalid, expired, replayed, or account unavailable" }, 401); }
    }
    const user = await sessionUserFromRequest(request, store);
    if (path === "get-session" && request.method === "GET") return json({ session: user ? { expiresIn: 86400 } : null, user });
    if (!user) return json({ error: "Sign in required" }, 401);
    if (path === "wallet/prepare" && request.method === "POST") {
      // Separate explicit operation; never delegate any login wallet during authentication.
      await ensureAppWalletDelegation(boundAppWallet(user).account, mainnetWalletChain);
      return json({ address: user.walletAddress });
    }
    if (path === "wallet/send" && request.method === "POST") {
      const input = await request.json();
      const execute = deps.execute ?? (await import("./product-wallet.server.ts")).executeProductRequest;
      return json(await execute(user, input));
    }
    if (path === "wallet/balance" && request.method === "GET") {
      const reader = createPublicClient({ chain: mainnetWalletChain, transport: monadTransport(143) });
      const balance = await reader.readContract({ address: MONAD_USDC, abi: erc20Abi, functionName: "balanceOf", args: [user.walletAddress] });
      return json({ address: user.walletAddress, balance: balance.toString(), chainId: 143, token: MONAD_USDC, maxApiPayment: "100000" });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === "Sign in again before a sensitive operation") return json({ error: error.message }, 401);
    return json({ error: "Operation unavailable. Check configuration or transaction status before retrying." }, 503);
  }
}
