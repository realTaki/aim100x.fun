#!/usr/bin/env node
/**
 * Run forge in contracts/. Clones forge-std / OpenZeppelin into gitignored lib/ if missing.
 */
import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPaymasterSigner } from "./paymaster-signer.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const root = join(repoRoot, "contracts");
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: node app/scripts/forge.mjs <forge-args...>");
  process.exit(1);
}

if (process.env.FOUNDRY_PROFILE === "fork" && !process.env.ALCHEMY_MONAD_TESTNET_RPC_URL) {
  console.error("fork profile requires ALCHEMY_MONAD_TESTNET_RPC_URL; local tests use the default profile");
  process.exit(1);
}

const forge = spawnSync("forge", ["--version"], { encoding: "utf8" });
if (forge.status !== 0) {
  console.error(
    "forge not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation",
  );
  process.exit(1);
}

function ensureGitDep(relDir, url, branch, markerRel) {
  const dir = join(root, relDir);
  if (existsSync(join(dir, markerRel))) return;
  rmSync(dir, { recursive: true, force: true });
  const inst = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", branch, url, dir],
    { stdio: "inherit" },
  );
  if (inst.status !== 0) process.exit(inst.status ?? 1);
  rmSync(join(dir, ".git"), { recursive: true, force: true });
}

ensureGitDep("lib/forge-std", "https://github.com/foundry-rs/forge-std", "v1.16.2", "src/Test.sol");
ensureGitDep(
  "lib/openzeppelin-contracts",
  "https://github.com/OpenZeppelin/openzeppelin-contracts",
  "v5.2.0",
  "contracts/token/ERC20/ERC20.sol",
);

const run = spawnSync("forge", args, {
  cwd: root,
  stdio: "inherit",
  env: applyPaymasterSigner(process.env),
});
process.exit(run.status ?? 1);
