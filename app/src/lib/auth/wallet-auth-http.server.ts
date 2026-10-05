import {
  gateIdentityFromHeaders,
  gateIdentityUserInfo,
} from "./gate-identity.server";
import { GATE_SESSION_MARKER_COOKIE } from "./gate-session-marker";
import {
  authConfigured,
  expireSessionCookieHeader,
  mintPasskeySessionToken,
  mintGateSessionToken,
  SESSION_TOKEN_COOKIE,
  sessionCookieHeader,
  verifySessionToken,
} from "./wallet-auth.server";
import { IDOLS100X_CHAIN_ID, IDOLS100X_RPC_URL } from "@/lib/idols100x";
import {
  mintPasskeyChallenge,
  passkeyRpFromRequest,
  resolvePasskeyPub,
  verifyPasskeyAssertionIssue,
  verifyPasskeyChallengeToken,
  inspectClientDataIssue,
  type PasskeyVerifyBody,
} from "./passkey-verify.server";
import {
  ENTRY_POINT_V06,
  PASSKEY_ACCOUNT_ABI,
  PASSKEY_ACCOUNT_FACTORY,
  PASSKEY_FACTORY_ABI,
  PIMLICO_BUNDLER_URL,
} from "./passkey-aa";
import { b64urlToBytes, bytesToB64url, bytesToHex } from "./passkey-webauthn";
import { createPublicClient, http, keccak256, type Address } from "viem";

const RPC_URLS = [IDOLS100X_RPC_URL, PIMLICO_BUNDLER_URL];

function rpcClient(url: string) {
  return createPublicClient({
    transport: http(url, { timeout: 8_000 }),
  });
}

const publicClient = rpcClient(IDOLS100X_RPC_URL);

function hexPad(value: bigint): `0x${string}` {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

async function factoryAddress(x: bigint, y: bigint): Promise<Address> {
  let last: unknown;
  for (const url of RPC_URLS) {
    try {
      return await rpcClient(url).readContract({
        address: PASSKEY_ACCOUNT_FACTORY,
        abi: PASSKEY_FACTORY_ABI,
        functionName: "getAddress",
        args: [x, y],
      });
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("wallet_rpc");
}

function json(body: Record<string, unknown>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function readBearer(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

function readSessionTokenFromRequest(request: Request): string | null {
  return readBearer(request) ?? readCookie(request, SESSION_TOKEN_COOKIE);
}

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

function gateMarkerSetHeader(): string {
  return `${GATE_SESSION_MARKER_COOKIE}=1; Path=/; Secure; SameSite=Lax; Max-Age=604800`;
}

function gateMarkerClearHeader(): string {
  return `${GATE_SESSION_MARKER_COOKIE}=; Path=/; Secure; SameSite=Lax; Max-Age=0`;
}

async function lookupByCredential(credentialId: Uint8Array): Promise<{
  address: Address;
  x: bigint;
  y: bigint;
} | null> {
  const account = await publicClient.readContract({
    address: PASSKEY_ACCOUNT_FACTORY,
    abi: PASSKEY_FACTORY_ABI,
    functionName: "accountOfCredential",
    args: [keccak256(bytesToHex(credentialId))],
  });
  if (account === "0x0000000000000000000000000000000000000000") return null;
  const [x, y] = await Promise.all([
    publicClient.readContract({
      address: account,
      abi: PASSKEY_ACCOUNT_ABI,
      functionName: "pubkeyX",
    }),
    publicClient.readContract({
      address: account,
      abi: PASSKEY_ACCOUNT_ABI,
      functionName: "pubkeyY",
    }),
  ]);
  return { address: account, x, y };
}

async function handleGetSession(request: Request): Promise<Response> {
  if (!authConfigured) {
    return json({ session: null, user: null });
  }

  const headers = new Headers();
  let token = readSessionTokenFromRequest(request);
  let user = token ? await verifySessionToken(token) : null;

  const gateIdentity = await gateIdentityFromHeaders(request.headers);
  if (gateIdentity) {
    const info = gateIdentityUserInfo(gateIdentity);
    const bound = user && (user.isGate ? user.id === info.id : false);
    if (!bound) {
      token = await mintGateSessionToken(info.id, info.name, info.email);
      user = await verifySessionToken(token);
      headers.append("Set-Cookie", sessionCookieHeader(token));
      headers.append("Set-Cookie", gateMarkerSetHeader());
    }
  } else if (user?.isGate) {
    token = null;
    user = null;
    headers.append("Set-Cookie", expireSessionCookieHeader());
    headers.append("Set-Cookie", gateMarkerClearHeader());
  } else if (user && user.embedded) {
    headers.append("Set-Cookie", gateMarkerClearHeader());
  }

  if (!user) {
    return json({ session: null, user: null }, { headers });
  }

  return json(
    {
      session: { token: token ?? undefined },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: null,
        embedded: user.embedded,
        passkey: user.embedded
          ? {
              x: user.passkeyX,
              y: user.passkeyY,
              credentialId: user.passkeyCredentialId,
            }
          : null,
      },
    },
    { headers },
  );
}

async function handlePasskeyChallenge(): Promise<Response> {
  const minted = mintPasskeyChallenge();
  return json(minted);
}

async function handlePasskeyVerify(request: Request): Promise<Response> {
  let body: PasskeyVerifyBody & { x?: string; y?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.nonceToken || !body.challenge || !verifyPasskeyChallengeToken(body.nonceToken, body.challenge)) {
    return json({ error: "Unauthorized", reason: "challenge" }, { status: 401 });
  }
  const { origin } = passkeyRpFromRequest(request);
  const mode = body.mode === "get" ? "get" : "create";
  let x: bigint;
  let y: bigint;
  let credentialId: Uint8Array;

  if (mode === "create") {
    if (!body.clientDataJSON) return json({ error: "Unauthorized", reason: "client" }, { status: 401 });
    const clientDataJSON = Buffer.from(b64urlToBytes(body.clientDataJSON)).toString("utf8");
    const clientIssue = inspectClientDataIssue(clientDataJSON, body.challenge, origin, "webauthn.create");
    if (clientIssue) return json({ error: "Unauthorized", reason: clientIssue }, { status: 401 });
    const resolved = resolvePasskeyPub(body);
    if (!resolved) return json({ error: "Unauthorized", reason: "pubkey" }, { status: 401 });
    x = resolved.x;
    y = resolved.y;
    credentialId = resolved.credentialId;
  } else {
    if (body.x && body.y && body.credentialId) {
      x = BigInt(body.x);
      y = BigInt(body.y);
      credentialId = b64urlToBytes(body.credentialId);
      const issue = verifyPasskeyAssertionIssue({ body, origin, challenge: body.challenge, x, y });
      if (issue) return json({ error: "Unauthorized", reason: issue }, { status: 401 });
    } else if (body.credentialId) {
      credentialId = b64urlToBytes(body.credentialId);
      let found: { address: Address; x: bigint; y: bigint } | null;
      try {
        found = await lookupByCredential(credentialId);
      } catch {
        return json({ error: "wallet_rpc" }, { status: 503 });
      }
      if (!found) return json({ error: "unknown_passkey" }, { status: 401 });
      x = found.x;
      y = found.y;
      const issue = verifyPasskeyAssertionIssue({ body, origin, challenge: body.challenge, x, y });
      if (issue) return json({ error: "Unauthorized", reason: issue }, { status: 401 });
    } else {
      return json({ error: "unknown_passkey" }, { status: 401 });
    }
  }

  let wallet: Address;
  try {
    wallet = await factoryAddress(x, y);
  } catch {
    return json({ error: "wallet_rpc" }, { status: 503 });
  }
  const token = await mintPasskeySessionToken({
    wallet,
    chainId: IDOLS100X_CHAIN_ID,
    x: hexPad(x),
    y: hexPad(y),
    credentialId: bytesToB64url(credentialId),
  });
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookieHeader(token));
  headers.append("Set-Cookie", gateMarkerClearHeader());
  return json(
    {
      token,
      address: wallet,
      x: hexPad(x),
      y: hexPad(y),
      credentialId: bytesToB64url(credentialId),
      entryPoint: ENTRY_POINT_V06,
    },
    { headers },
  );
}

export async function handleWalletAuthRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const subpath = url.pathname.replace(/^\/api\/auth\/?/, "");
  const method = request.method.toUpperCase();

  if (subpath === "get-session" && method === "GET") {
    return handleGetSession(request);
  }

  if (!authConfigured) {
    return json({ error: "Auth disabled" }, { status: 404 });
  }

  if (subpath === "passkey/challenge" && method === "POST") {
    return handlePasskeyChallenge();
  }

  if (subpath === "passkey/verify" && method === "POST") {
    return handlePasskeyVerify(request);
  }

  if (subpath === "sign-out" && method === "POST") {
    const headers = new Headers();
    headers.append("Set-Cookie", expireSessionCookieHeader());
    headers.append("Set-Cookie", gateMarkerClearHeader());
    return json({ success: true }, { headers });
  }

  return json({ error: "Not found" }, { status: 404 });
}

export async function sessionUserFromRequest(
  request: Request,
): Promise<{
  id: string;
  email: string | null;
  walletAddress: `0x${string}` | null;
  embedded: boolean;
} | null> {
  const token = readSessionTokenFromRequest(request);
  if (!token) return null;
  const user = await verifySessionToken(token);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    walletAddress: user.walletAddress,
    embedded: user.embedded,
  };
}
