# Contracts CI: local assertions and explicit forks

Baseline main `3787275`; failing CI run:
https://github.com/realTaki/aim100x.fun/actions/runs/38520768256
The app job passed while the contracts job compiled successfully and then failed
before assertions, attempting to retrieve a chain ID from the literal unresolved
`${ALCHEMY_MONAD_TESTNET_RPC_URL}` path. Local reproduction produced the same error.

## Repair

`profile.default` retains the Monad local EVM and testnet chain ID, including
P-256 precompile support, but contains no eth_rpc_url. All current contract tests
use locally deployed fixtures/mock token/TBA/EntryPoint dependencies and no
createFork/createSelectFork calls. No test or assertion was removed or skipped.

Live eth_rpc_url is confined to explicit `profile.fork`. The named testnet endpoint
remains available for deliberate integration use. The wrapper fails clearly
before tool/dependency/network access when fork is selected without configuration.
No public RPC substitution, credential creation or live fork operation is added.
There is no dedicated live fork test suite in this repository; these results do
not verify current deployed contracts or RPC access.

The contracts CI job pins Foundry v1.8.5 and selects default explicitly. Compilation
may download pinned public libraries and Solc; the subsequent `test --offline -vv`
runs all assertions without network access. RPC override variables are blank in
this job. Errors propagate normally; there is no continue-on-error, test filter,
empty suite or exception swallowing to turn the job green.

## Local evidence

Foundry v1.8.5 (official release), Solc 0.8.24:

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| LonelyUSDTest | 5 | 0 | 0 |
| PasskeyAccountTest | 10 | 0 | 0 |
| Idols100xTest | 28 | 0 | 0 |
| Total | 43 | 0 | 0 |

The P-256 known-good/invalid-point vector remains a real local precompile check,
not a mock that merely returns true. Default config reports no RPC endpoint.
Explicit unconfigured fork exits 1 with a variable-name-only error. A subprocess
regression test uses a missing-toolchain fixture to prove the failure occurs
before any Forge or network probe.

Root commands, with a clean environment and temporary toolchain path locally:

```sh
FOUNDRY_PROFILE=default node app/scripts/forge.mjs build
FOUNDRY_PROFILE=default node app/scripts/forge.mjs test --offline -vv
```

For separately authorized integration work, operators select FOUNDRY_PROFILE=fork
and provide the server-only Alchemy testnet setting through their secure runtime.
Do not paste values into commands or logs. No fork, deployment script or broadcast
was executed in this repair.

Evidence logs: `/tmp/aim-contracts-baseline.log`, `/tmp/aim-contracts-build.log`,
`/tmp/aim-contracts-fixed.log`, `/tmp/aim-contracts-fork-unconfigured.log`.
The CI/deployment URLs for the resulting commit are reported separately after push.

Only Foundry config, the contracts CI job, the missing-fork configuration guard,
its test and documentation changed. Production authentication, JWKS, business
wallet execution, mainnet blocks, icon files and credentials remain untouched.
