import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import { describe, it } from "node:test";
import { bytesToHex } from "../auth/passkey-webauthn.ts";
import { agentConfigMarkdown } from "../agent-account.ts";
import { MCP_AUTH_CHALLENGE, MCP_USEROP_WAIT_MS, REMOTE_MCP_URL } from "./constants.ts";
import { deriveAgentPublic, parseP256PrivateKey } from "./derive.server.ts";
import { signWebAuthn } from "./envelope.ts";
import { createMcpBearerToken, parseMcpBearerToken } from "./token.ts";
import { handleMcpHttpRequest } from "./http.server.ts";
import { verifyWebAuthn } from "./verify.server.ts";

const PRIVATE_KEY = `0x${"01".padStart(64, "0")}` as const;

function fixtureKey() {
  const privateKey = parseP256PrivateKey(PRIVATE_KEY);
  return { privateKey, ...deriveAgentPublic(privateKey) };
}

describe("remote MCP auth envelope", () => {
  it("signs and verifies the lonelyfuns.mcp.v1 WebAuthn challenge", async () => {
    const key = fixtureKey();
    const sig = await signWebAuthn(key, MCP_AUTH_CHALLENGE);
    assert.equal(verifyWebAuthn(sig, MCP_AUTH_CHALLENGE, key.pubkeyX, key.pubkeyY), true);
    assert.equal(verifyWebAuthn(sig, `0x${"ab".repeat(32)}`, key.pubkeyX, key.pubkeyY), false);
  });

  it("round-trips the lf1 bearer token and rejects a tampered signature", async () => {
    const key = fixtureKey();
    const token = await createMcpBearerToken(key, true);
    assert.match(token, /^lf1\./);
    const parsed = parseMcpBearerToken(token);
    assert.ok(parsed);
    assert.equal(parsed.d, key.privateKey);
    assert.equal(verifyWebAuthn(parsed.sig, MCP_AUTH_CHALLENGE, BigInt(parsed.x), BigInt(parsed.y)), true);
    const broken = parseMcpBearerToken(token.slice(0, -4) + "abcd");
    assert.equal(broken, null);
  });

  it("keeps UserOp wait under Hobby maxDuration", () => {
    assert.equal(MCP_USEROP_WAIT_MS < 60_000, true);
    assert.equal(MCP_USEROP_WAIT_MS > 10_000, true);
  });

  it("rejects missing or garbage bearer tokens without storing anything", async () => {
    const missing = await handleMcpHttpRequest(
      new Request("https://lonelyfuns.vercel.app/mcp", { method: "POST" }),
    );
    assert.equal(missing.status, 401);
    const garbage = await handleMcpHttpRequest(
      new Request("https://lonelyfuns.vercel.app/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer not-a-token" },
      }),
    );
    assert.equal(garbage.status, 401);
    const preflight = await handleMcpHttpRequest(
      new Request("https://lonelyfuns.vercel.app/mcp", { method: "OPTIONS" }),
    );
    assert.equal(preflight.status, 204);
  });
});

describe("agent Codex markdown", () => {
  it("tells Codex to use the remote Streamable HTTP URL and a bearer env var", async () => {
    const key = fixtureKey();
    const markdown = await agentConfigMarkdown({
      version: 1,
      privateKey: key.privateKey,
      pubkeyX: `0x${key.pubkeyX.toString(16).padStart(64, "0")}`,
      pubkeyY: `0x${key.pubkeyY.toString(16).padStart(64, "0")}`,
      agentAccount: "0x0000000000000000000000000000000000000001",
      role: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    assert.match(markdown, new RegExp(REMOTE_MCP_URL.replaceAll(".", "\\.")));
    assert.match(markdown, /codex mcp add lonelyfuns --url/);
    assert.match(markdown, /--bearer-token-env-var LONELYFUNS_MCP_TOKEN/);
    assert.match(markdown, /export LONELYFUNS_MCP_TOKEN='lf1\./);
    assert.match(markdown, /Authorization/);
    assert.match(markdown, /does not store/);
    assert.match(markdown, /Bearer \$LONELYFUNS_MCP_TOKEN|Bearer lf1\./);
    assert.doesNotMatch(markdown, /upload key to Vercel/i);
    assert.doesNotMatch(markdown, /mcp\/build/);
    assert.doesNotMatch(markdown, /Local stdio/i);
    assert.doesNotMatch(markdown, /headers.helper/i);
    assert.doesNotMatch(markdown, /LONELYFUNS_AGENT_PRIVATE_KEY/);
  });
});

describe("P-256 derive", () => {
  it("matches node ECDH uncompressed coordinates", () => {
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(PRIVATE_KEY.slice(2), "hex"));
    const publicKey = ecdh.getPublicKey(undefined, "uncompressed");
    const derived = deriveAgentPublic(PRIVATE_KEY);
    assert.equal(derived.pubkeyX, BigInt(bytesToHex(publicKey.subarray(1, 33))));
    assert.equal(derived.pubkeyY, BigInt(bytesToHex(publicKey.subarray(33, 65))));
  });
});
