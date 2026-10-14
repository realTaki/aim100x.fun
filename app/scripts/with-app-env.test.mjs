import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import {
  APP_ENV_REL_PATH,
  mergeAppEnv,
  parseAppEnv,
  projectRoot,
  readAppEnv,
} from "./with-app-env.mjs";
import { applyPaymasterSigner, readPaymasterSigner } from "./paymaster-signer.mjs";

// Ambient credentials/flags must not enter child-process fixtures either.
const execFileAsync = (file, args, options = {}) =>
  promisify(execFile)(file, args, {
    ...options,
    env: { PATH: process.env.PATH, ...options.env },
  });
// Exercise the actual wrapper source in a synthetic app, never the developer's
// ignored .env.local or .grok/notion.local. The wrapper resolves its own root.
const cliRoot = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
mkdirSync(join(cliRoot, "scripts"));
for (const file of ["with-app-env.mjs", "paymaster-signer.mjs"]) {
  copyFileSync(join(projectRoot(), "scripts", file), join(cliRoot, "scripts", file));
}
after(() => rmSync(cliRoot, { recursive: true, force: true }));
const WRAPPER = join(cliRoot, "scripts/with-app-env.mjs");
const PRINT_FLAG = "process.stdout.write(String(process.env.VITE_AUTH_ENABLED));";

function makeWorkspace(appEnvJson) {
  const root = mkdtempSync(join(tmpdir(), "app-env-"));
  if (appEnvJson !== undefined) {
    mkdirSync(join(root, ".grok"), { recursive: true });
    writeFileSync(join(root, APP_ENV_REL_PATH), appEnvJson);
  }
  return root;
}

test("keeps VITE_-prefixed string entries", () => {
  assert.deepEqual(parseAppEnv('{"VITE_AUTH_ENABLED":"false"}'), {
    VITE_AUTH_ENABLED: "false",
  });
});

test("drops non-VITE keys, non-string values and malformed documents", () => {
  assert.deepEqual(parseAppEnv('{"DATABASE_URL":"postgres://x","VITE_N":1,"VITE_OK":"y"}'), {
    VITE_OK: "y",
  });
  assert.deepEqual(parseAppEnv("not json"), {});
  assert.deepEqual(parseAppEnv('["VITE_AUTH_ENABLED"]'), {});
  assert.deepEqual(parseAppEnv("null"), {});
});

test("a missing app-env.json is a clean no-op", () => {
  assert.deepEqual(readAppEnv(makeWorkspace()), {});
});

test("reads the app env from a workspace", () => {
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  assert.deepEqual(readAppEnv(root), { VITE_AUTH_ENABLED: "false" });
});

test("an explicit process-env override wins over the file", () => {
  const merged = mergeAppEnv(
    { VITE_AUTH_ENABLED: "false" },
    { VITE_AUTH_ENABLED: "true", PATH: "/usr/bin" },
  );
  assert.equal(merged.VITE_AUTH_ENABLED, "true");
  assert.equal(merged.PATH, "/usr/bin");
});

test("AIM100x does not ship an auth-disabling template override", () => {
  assert.deepEqual(readAppEnv(projectRoot()), {});
});

test("vite loadEnv resolves the wrapped value", () => {
  // What `import.meta.env.VITE_AUTH_ENABLED` becomes: loadEnv prefix-matches
  // process.env, so the wrapper's merge has to land before Vite starts.
  // Do not `import { loadEnv } from "vite"` here — Vite 8 loads rolldown
  // native bindings that SIGSEGV the test worker under qemu-user.
  const root = makeWorkspace('{"VITE_AUTH_ENABLED":"false"}');
  const merged = mergeAppEnv(readAppEnv(root), { PATH: "/usr/bin" });
  assert.equal(merged.VITE_AUTH_ENABLED, "false");
});

test("the wrapped command runs with the app env applied", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    WRAPPER,
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, "false");
});

test("the wrapped command sees an explicit override, not the file value", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    [WRAPPER, process.execPath, "-e", PRINT_FLAG],
    { env: { VITE_AUTH_ENABLED: "true" } },
  );
  assert.equal(stdout, "true");
});

test("the wrapper propagates the command's exit code", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [WRAPPER, process.execPath, "-e", "process.exit(3)"]),
    (err) => err.code === 3,
  );
});

test("a signal-killed command is never reported as success", async () => {
  // The wrapper's own SIGTERM handler must not swallow the re-raised signal:
  // a cancelled build reporting exit 0 is a silently passing gate.
  await assert.rejects(
    execFileAsync(process.execPath, [
      WRAPPER,
      process.execPath,
      "-e",
      "process.kill(process.pid, 'SIGTERM');setTimeout(() => {}, 1000);",
    ]),
    (err) => err.signal === "SIGTERM" || err.code !== 0,
  );
});

test("the CLI still runs when invoked through a symlinked path", async () => {
  // node realpaths import.meta.url but not process.argv[1], so a raw comparison
  // turns the wrapper into a no-op that exits 0 without starting anything.
  const link = join(mkdtempSync(join(tmpdir(), "app-env-link-")), "scripts");
  symlinkSync(join(cliRoot, "scripts"), link);
  const { stdout } = await execFileAsync(process.execPath, [
    join(link, "with-app-env.mjs"),
    process.execPath,
    "-e",
    PRINT_FLAG,
  ]);
  assert.equal(stdout, "false");
});

test("GROKBOT_WEB3_WALLET fills PAYMASTER_SIGNER when unset", () => {
  const grokbot = `0x${"ab".repeat(32)}`;
  const env = applyPaymasterSigner({ GROKBOT_WEB3_WALLET: grokbot });
  assert.equal(env.PAYMASTER_SIGNER, grokbot);
  assert.equal(readPaymasterSigner(env), grokbot);
});

test("an explicit PAYMASTER_SIGNER is not overwritten by GROKBOT", () => {
  const signer = `0x${"cd".repeat(32)}`;
  const env = applyPaymasterSigner({
    PAYMASTER_SIGNER: signer,
    GROKBOT_WEB3_WALLET: `0x${"ab".repeat(32)}`,
  });
  assert.equal(env.PAYMASTER_SIGNER, signer);
});

test("the wrapped command aliases GROKBOT_WEB3_WALLET as PAYMASTER_SIGNER", async () => {
  const grokbot = `0x${"ee".repeat(32)}`;
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      WRAPPER,
      process.execPath,
      "-e",
      "process.stdout.write(String(process.env.PAYMASTER_SIGNER === process.env.GROKBOT_WEB3_WALLET));",
    ],
    {
      env: {
        PATH: process.env.PATH,
        GROKBOT_WEB3_WALLET: grokbot,
      },
    },
  );
  assert.equal(stdout, "true");
});
