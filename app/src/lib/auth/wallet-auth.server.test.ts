import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import {
  mintPasskeySessionToken,
  verifySessionToken,
} from "./wallet-auth.server.ts";
import {
  mintPasskeyChallenge,
  verifyPasskeyChallengeToken,
} from "./passkey-verify.server.ts";

const ACCOUNT = "0xa445bac003026f5adf51760ca850ad66750e90ad" as const;
const PASSKEY = {
  wallet: ACCOUNT,
  chainId: 10143,
  x: "0x" + "11".repeat(32),
  y: "0x" + "22".repeat(32),
  credentialId: "abc",
} as const;

describe("Passkey session JWT", () => {
  it("mints a session bound to the smart-account address without BETTER_AUTH_SECRET", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.BETTER_AUTH_URL;
    const token = await mintPasskeySessionToken(PASSKEY);
    const user = await verifySessionToken(token);
    assert.equal(user?.embedded, true);
    assert.equal(user?.passkeyCredentialId, "abc");
    assert.equal(user?.walletAddress?.toLowerCase(), ACCOUNT);
    assert.equal(user?.passkeyX, "0x" + "11".repeat(32));
  });

  it("accepts a structurally valid passkey JWT regardless of signing key", async () => {
    delete process.env.BETTER_AUTH_SECRET;
    const token = await new SignJWT({
      typ: "passkey",
      chainId: 10143,
      px: PASSKEY.x,
      py: PASSKEY.y,
      cid: PASSKEY.credentialId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(ACCOUNT)
      .setIssuedAt()
      .sign(new TextEncoder().encode("some-other-secret-that-is-32-bytes!!"));
    const user = await verifySessionToken(token);
    assert.equal(user?.walletAddress?.toLowerCase(), ACCOUNT);
    assert.equal(user?.passkeyCredentialId, "abc");
  });

  it("rejects a malformed token and a passkey payload missing coordinates", async () => {
    assert.equal(await verifySessionToken("not-a-jwt"), null);
    const token = await new SignJWT({
      typ: "passkey",
      chainId: 10143,
      cid: "abc",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(ACCOUNT)
      .sign(new TextEncoder().encode("wrap"));
    assert.equal(await verifySessionToken(token), null);
  });
});

describe("Passkey challenge MAC", () => {
  it("mints and verifies a challenge without BETTER_AUTH_SECRET", () => {
    delete process.env.BETTER_AUTH_SECRET;
    const minted = mintPasskeyChallenge();
    assert.equal(verifyPasskeyChallengeToken(minted.nonceToken, minted.challenge), true);
    assert.equal(verifyPasskeyChallengeToken(minted.nonceToken, "other-challenge"), false);
    const tampered = `${minted.nonceToken.slice(0, -2)}aa`;
    assert.equal(verifyPasskeyChallengeToken(tampered, minted.challenge), false);
  });
});
