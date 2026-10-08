import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PASSKEY_AUTHENTICATOR_NAME_PREFIX,
  base64UrlEncode,
  bytesToBigint,
  canonicalWebauthnOrigin,
  hexToBytes,
  isLonelyfunsWebauthnOrigin,
  parseEcdsaDer,
  parseP256Spki,
  passkeyCreateRequest,
  passkeyDiscoverableRequest,
  passkeyUserFromName,
  webauthnOriginsMatch,
} from "./passkey-webauthn.ts";

describe("passkey webauthn helpers", () => {
  it("base64url-encodes 32 bytes without padding", () => {
    const bytes = hexToBytes("bb5a52f42f9c9261ed4361f59422a1e30036e7c32b270c8807a419feca605023");
    const encoded = base64UrlEncode(bytes);
    assert.equal(encoded.includes("="), false);
    assert.equal(encoded.includes("+"), false);
    assert.equal(encoded.includes("/"), false);
    assert.equal(encoded, "u1pS9C-ckmHtQ2H1lCKh4wA258MrJwyIB6QZ_spgUCM");
  });

  it("parses SPKI P-256 coordinates from the uncompressed point", () => {
    const prefix = hexToBytes("3059301306072a8648ce3d020106082a8648ce3d03010703420004");
    const x = hexToBytes("11".repeat(32));
    const y = hexToBytes("22".repeat(32));
    const spki = new Uint8Array(prefix.length + 64);
    spki.set(prefix, 0);
    spki.set(x, prefix.length);
    spki.set(y, prefix.length + 32);
    const parsed = parseP256Spki(spki);
    assert.equal(parsed.x, bytesToBigint(x));
    assert.equal(parsed.y, bytesToBigint(y));
  });

  it("parses IEEE P1363 values out of a DER ECDSA signature", () => {
    const r = hexToBytes("01".repeat(32));
    const s = hexToBytes("02".repeat(32));
    const der = new Uint8Array(2 + 2 + 32 + 2 + 32);
    der[0] = 0x30;
    der[1] = 68;
    der[2] = 0x02;
    der[3] = 32;
    der.set(r, 4);
    der[36] = 0x02;
    der[37] = 32;
    der.set(s, 38);
    const parsed = parseEcdsaDer(der);
    assert.equal(parsed.r, bytesToBigint(r));
    assert.equal(parsed.s, bytesToBigint(s));
  });
});

describe("passkeyUserFromName", () => {
  it("prefixes the authenticator name, not the typed in-app username", () => {
    assert.deepEqual(passkeyUserFromName("  Taki  "), {
      name: "aim100x.fun - Taki",
      displayName: "aim100x.fun - Taki",
    });
    assert.deepEqual(passkeyUserFromName("fan two"), {
      name: "aim100x.fun - fan two",
      displayName: "aim100x.fun - fan two",
    });
    assert.equal(PASSKEY_AUTHENTICATOR_NAME_PREFIX, "aim100x.fun - ");
  });

  it("rejects a blank name", () => {
    assert.equal(passkeyUserFromName(""), null);
    assert.equal(passkeyUserFromName("   "), null);
  });

  it("clips the prefixed label to 64 UTF-8 bytes without splitting a code point", () => {
    const user = passkeyUserFromName("😀".repeat(20));
    assert.ok(user);
    assert.equal(user.name, user.displayName);
    assert.equal(new TextEncoder().encode(user.name).length <= 64, true);
    assert.equal(user.name.startsWith(PASSKEY_AUTHENTICATOR_NAME_PREFIX), true);
    assert.equal(user.name, `${PASSKEY_AUTHENTICATOR_NAME_PREFIX}${"😀".repeat(12)}`);
  });
});

describe("webauthn origin", () => {
  it("strips default https port that reverse proxies add", () => {
    assert.equal(
      canonicalWebauthnOrigin("https://lonelyfuns.grok.me:443"),
      "https://lonelyfuns.grok.me",
    );
    assert.equal(
      webauthnOriginsMatch("https://lonelyfuns.grok.me:443", "https://lonelyfuns.grok.me"),
      true,
    );
    assert.equal(isLonelyfunsWebauthnOrigin("https://lonelyfuns.grok.me"), true);
    assert.equal(isLonelyfunsWebauthnOrigin("https://evil.grok.me"), false);
  });
});

describe("passkeyDiscoverableRequest", () => {
  it("does not lock get() to a credentialId or a platform authenticator", () => {
    const challenge = new Uint8Array(32);
    const options = passkeyDiscoverableRequest(challenge, "lonelyfuns.vercel.app");
    assert.equal("allowCredentials" in options, false);
    assert.equal(options.allowCredentials, undefined);
    assert.equal("authenticatorAttachment" in options, false);
    assert.equal(options.rpId, "lonelyfuns.vercel.app");
    assert.equal(options.userVerification, "required");
  });
});

describe("passkeyCreateRequest", () => {
  it("requires a resident UV passkey without forcing platform attachment", () => {
    const challenge = new Uint8Array(32);
    const userId = new Uint8Array(32);
    const user = passkeyUserFromName("Taki");
    assert.ok(user);
    const options = passkeyCreateRequest(challenge, "localhost", {
      id: userId,
      name: user.name,
      displayName: user.displayName,
    });
    assert.equal(options.authenticatorSelection?.residentKey, "required");
    assert.equal(options.authenticatorSelection?.userVerification, "required");
    assert.equal("authenticatorAttachment" in (options.authenticatorSelection ?? {}), false);
    assert.equal(options.rp.id, "localhost");
    assert.equal(options.rp.name, "aim100x.fun");
    assert.equal(options.user.name, "aim100x.fun - Taki");
    assert.equal(options.user.displayName, "aim100x.fun - Taki");
  });
});
