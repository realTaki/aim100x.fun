import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("an explicit fork without configuration fails before probing tools or a network", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./forge.mjs", import.meta.url)), "test"], {
    env: { FOUNDRY_PROFILE: "fork", PATH: "/missing-toolchain-fixture" }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fork profile requires ALCHEMY_MONAD_TESTNET_RPC_URL/);
  assert.doesNotMatch(result.stderr, /forge not found|Cloning|fork endpoint/);
  assert.equal(result.stdout, "");
});
