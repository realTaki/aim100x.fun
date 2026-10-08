import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { createPublicClient, erc20Abi, getAddress, http, type Address, type Hex } from "viem";
import { createSiweMessage, parseSiweMessage } from "viem/siwe";
import { deriveAppWallet, sessionSigningKey } from "./app-wallet.server.ts";
import { ensureAppWalletDelegation } from "./app-wallet-executor.server.ts";
import { mainnetWalletChain, MONAD_USDC } from "./app-wallet-chain.ts";
import {
  authConfigured,
  expireSessionCookieHeader,
  mintWalletSessionToken,
  SESSION_TOKEN_COOKIE,
  sessionCookieHeader,
  verifySessionToken,
} from "./wallet-auth.server.ts";

const CHALLENGE_COOKIE = "__Host-aim-wallet.challenge";
const STATEMENT =
  "Sign in to aim100x.fun. Your external wallet owns NFTs and signs product payments. The app creates a separate server-managed API wallet. Fund it with Monad USDC for automatic API payments (maximum 0.10 USDC per API call).";
function json(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function cookie(request: Request, name: string): string | null {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`));
  return value ? value.slice(name.length + 1) : null;
}
const challengeCookie = (token: string, maxAge = 300) =>
  `${CHALLENGE_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
export function isSameOriginWalletRequest(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (
    (!site || site === "same-origin" || site === "none") &&
    (!origin || origin === new URL(request.url).origin)
  );
}
export async function sessionUserFromRequest(request: Request) {
  // Login sessions are cookie-only: never accept the old client-held bearer JWTs.
  const token = cookie(request, SESSION_TOKEN_COOKIE);
  return token ? verifySessionToken(token) : null;
}
async function initialize(loginAddress: Address) {
  const owner = deriveAppWallet(loginAddress).account;
  // Only the API wallet is delegated. The external NFT wallet is never delegated.
  await ensureAppWalletDelegation(owner, mainnetWalletChain);
  return owner.address;
}
export async function handleWalletAuthRequest(
  request: Request,
  deps: {
    initialize?: typeof initialize;
    verifySignature?: (
      message: string,
      signature: Hex,
      address: Address,
      domain: string,
    ) => Promise<boolean>;
  } = {},
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/auth\/?/, "");
  if (!isSameOriginWalletRequest(request))
    return json({ error: "Cross-origin request blocked" }, 403);
  if (request.method === "POST" && request.headers.get("origin") !== url.origin)
    return json({ error: "Same-origin request required" }, 403);
  try {
    if (path === "sign-out" && request.method === "POST")
      return json({ success: true }, 200, [
        expireSessionCookieHeader(),
        challengeCookie("", 0),
        "__Host-grok-auth.session_token=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0",
      ]);
    if (!authConfigured) return json({ error: "Wallet login is disabled" }, 503);
    if (path === "wallet/challenge" && request.method === "POST") {
      const body = await request.json();
      if (typeof body.address !== "string" || !/^0x[a-f0-9]{40}$/i.test(body.address))
        return json({ error: "Invalid login address" }, 400);
      const address = getAddress(body.address.toLowerCase());
      const nonce = randomBytes(16).toString("hex");
      const issuedAt = new Date();
      const message = createSiweMessage({
        address,
        chainId: 143,
        domain: url.host,
        uri: url.origin,
        version: "1",
        nonce,
        statement: STATEMENT,
        issuedAt,
        expirationTime: new Date(issuedAt.getTime() + 300_000),
      });
      const token = await new SignJWT({ message })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("aim100x.fun/login-challenge/v1")
        .setAudience(url.origin)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(sessionSigningKey());
      return json({ message }, 200, [challengeCookie(token)]);
    }
    if (path === "wallet/verify" && request.method === "POST") {
      const body = await request.json();
      const token = cookie(request, CHALLENGE_COOKIE);
      if (
        !token ||
        typeof body.message !== "string" ||
        typeof body.signature !== "string" ||
        body.signature.length > 8192
      )
        return json({ error: "Invalid login challenge" }, 401);
      let message: string;
      try {
        const { payload } = await jwtVerify(token, sessionSigningKey(), {
          algorithms: ["HS256"],
          issuer: "aim100x.fun/login-challenge/v1",
          audience: url.origin,
          requiredClaims: ["exp"],
        });
        if (typeof payload.message !== "string" || payload.message !== body.message)
          throw new Error();
        message = payload.message;
      } catch {
        return json({ error: "Login challenge expired or changed" }, 401);
      }
      const parsed = parseSiweMessage(message);
      if (
        !parsed.address ||
        parsed.domain !== url.host ||
        parsed.uri !== url.origin ||
        parsed.chainId !== 143
      )
        return json({ error: "Invalid login identity" }, 401);
      const reader = createPublicClient({
        chain: mainnetWalletChain,
        transport: http(mainnetWalletChain.rpcUrls.default.http[0]),
      });
      const valid = deps.verifySignature
        ? await deps.verifySignature(message, body.signature as Hex, parsed.address, url.host)
        : await reader.verifySiweMessage({
            message,
            signature: body.signature as Hex,
            address: parsed.address,
            domain: url.host,
          });
      if (!valid) return json({ error: "Wallet signature rejected" }, 401);
      const address = await (deps.initialize ?? initialize)(parsed.address);
      const session = await mintWalletSessionToken(parsed.address);
      return json({ address, loginAddress: parsed.address }, 200, [
        sessionCookieHeader(session),
        challengeCookie("", 0),
      ]);
    }
    const user = await sessionUserFromRequest(request);
    if (path === "get-session" && request.method === "GET")
      return json({ session: user ? { expiresIn: 86400 } : null, user });
    if (!user) return json({ error: "Wallet login required" }, 401);
    if (path === "wallet/prepare" && request.method === "POST") {
      const address = await initialize(user.loginAddress!);
      return json({ address });
    }
    if (path === "wallet/send" && request.method === "POST") {
      return json(
        { error: "NFT and product payments must be signed by your external wallet" },
        403,
      );
    }
    if (path === "wallet/balance" && request.method === "GET") {
      const reader = createPublicClient({
        chain: mainnetWalletChain,
        transport: http(mainnetWalletChain.rpcUrls.default.http[0]),
      });
      const balance = await reader.readContract({
        address: MONAD_USDC,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [user.walletAddress!],
      });
      return json({
        address: user.walletAddress,
        loginAddress: user.loginAddress,
        balance: balance.toString(),
        chainId: 143,
        token: MONAD_USDC,
        maxApiPayment: "100000",
      });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    const text = error instanceof Error ? error.message : "Wallet request failed";
    // Do not include RPC errors (may contain signed transaction bytes).
    const safe =
      /^(Configure and back up|7702 infrastructure|Wallet RPC|Unexpected 7702|Refusing to overwrite|Invalid call|Invalid calls|Unsupported|Network gas|Operation exceeds|Sign in)/.test(
        text,
      );
    return json(
      {
        error: safe
          ? text
          : "Wallet operation failed. Check configuration and chain confirmation before retrying.",
      },
      503,
    );
  }
}
