import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identiconDataUrl } from "./identicon.ts";

describe("identiconDataUrl", () => {
  it("is deterministic for the same seed", () => {
    const a = identiconDataUrl("0xabc123");
    const b = identiconDataUrl("0xabc123");
    assert.equal(a, b);
    assert.match(a, /^data:image\/svg\+xml,/);
  });

  it("differs for different seeds", () => {
    assert.notEqual(
      identiconDataUrl("0x0000000000000000000000000000000000000001"),
      identiconDataUrl("0x0000000000000000000000000000000000000002"),
    );
  });
});

it("owner/address selection uses only the explicit APP wallet and never login/display fallbacks", async () => {
  const { walletAddressFromUser } = await import("./wallet-address.ts");
  const login = "0x1111111111111111111111111111111111111111";
  const app = "0x2222222222222222222222222222222222222222";
  const user = {
    id: login,
    legacyLoginAddress: login,
    displayName: login,
    primaryEmail: `${login}@lonelyfuns.local`,
    profileImageUrl: null,
    isDevFallback: false,
    apiWalletAddress: app,
  } as const;
  assert.equal(walletAddressFromUser(user), app);
  for (const apiWalletAddress of [undefined, "0xinvalid"] as const) {
    const incomplete = { ...user, apiWalletAddress } as unknown as typeof user;
    assert.equal(walletAddressFromUser(incomplete), null);
  }
  assert.equal(walletAddressFromUser({ ...user, isDevFallback: true }), null);
});
