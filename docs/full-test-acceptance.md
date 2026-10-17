# Full npm test repair acceptance

Branch: `feat/independent-app-wallets`; baseline `141df2a554ba8346ef04a6a3751b3416f5a09601`.
The worktree was clean before this item. Scope is the 16 existing script-suite
failures only. No app business logic, icons, environment configuration,
dependencies or deployment settings changed.

## Baseline and diagnosis

A fresh `npm test` reproduced 191 script tests: 175 passed, 16 failed. The wrapper
uses `script tests && source tests`, so the baseline stopped before source tests.

| Failure group | Count | Cause and correction |
| --- | --- | --- |
| OG title / placeholder / streaming cases | 8 | Generic template tests implicitly read the actual app cwd, discovering aim100x.fun's site.json and existing og.jpg. The implementation's filesystem precedence was correct. Isolate generic cases with an empty temporary cwd; keep every existing expected title, escaping, placeholder and stream assertion. Explicit filesystem fixtures still override this cwd. Add an integration assertion that the real AIM100x identity/card wins. |
| Auth environment and wrapper CLI cases | 4 | Tests assumed the original template shipped `VITE_AUTH_ENABLED=false`. This app intentionally has no such override. Pin actual app default to auth-on, and retain false-file/true-process precedence in temporary fixtures. Execute copies of the actual wrapper and its dependency in a synthetic app root, including the symlink case. Child processes receive only fixture environment values and PATH. |
| Missing template skill/agent documentation | 4 | Three brand-check tests and one atomic-handover test depended on removed upstream `.grok/skills/og` and AGENTS documents. Add a repository-owned CLI maintenance guide. Retain marker path/expiry and command argument checks, test exact expiry boundary and immediate self-check failure while a marker is pending. Execute all three documented atomic handovers in disposable fixtures and assert target bytes and staged-file removal. |

The production-code defect found in this scope was stale brand-check diagnostic
links to the absent upstream skill. They now point to `scripts/brand-assets.md`.
No OG rendering, auth default, signing, billing or RPC behavior was altered to
make tests pass. The obsolete prose check for upstream agent orchestration
commands was replaced with a bounded real CLI check; those absent prompts are
not recreated as instructions for this project.

The environment CLI tests previously ran the repository's wrapper directly,
which attempts to load ignored local files. They now resolve the wrapper's root
inside a temporary fixture and cannot load the developer's `.env.local`.
No credential value is needed for these tests.

## Final verification

| Check | Result |
| --- | --- |
| Full root `npm test` | Exit 0; both script and source stages ran |
| Script stage | 192 tests, 192 passed, 0 failed, 0 skipped |
| Source stage | 392 tests, 390 passed, 0 failed, 2 pre-existing live probes skipped |
| Combined | 584 tests, 582 passed, 0 failed, 2 pre-existing live probes skipped |
| Root `npm run typecheck` | Exit 0 |
| Production Vite build | Exit 0; existing large-chunk warning remains |
| `git diff --check` | Passed |

No test filtering, new skip, todo, or relaxation of the existing OG/security
assertions was introduced. The two existing P-256 chain probes require
`RUN_CHAIN_TESTS=true`; they were not activated because live chain access is
outside this offline task. Their code is unchanged. This is not a claim that
all live integrations were exercised.

Commands:

```sh
# repository root, complete command (no test-name filters)
env -i PATH="$PATH" HOME=/tmp npm test
env -i PATH="$PATH" HOME=/tmp npm run typecheck
# app directory, production build without loading ignored environment files
# avoids the root build wrapper's dependency installation and secret-loading path
env -i PATH="$PATH" HOME=/tmp node --input-type=module -e 'import { build } from "vite"; await build({envDir:false});'
```

Temporary logs: `/tmp/aim-full-test-baseline.log`,
`/tmp/aim-full-test-final.log`, `/tmp/aim-full-typecheck-final.log`,
`/tmp/aim-full-build-final.log`.

## Preserved boundaries and remaining work

Independent login accounts, testnet LUSD simulated payment / MiniMax China,
Alchemy-only testnet 10143 routing, mainnet blocking, header wordmark and Vercel
branch deployment blocks remain unchanged. No mainnet merge, deployment,
transaction, paid API request, icon replacement or dependency update occurred.
The remote main branch advanced independently to `6182c6b` during this task's
observation window; this work neither writes to nor incorporates main.

The 16 script failures are resolved. Live Alchemy configuration/acceptance, the
old preview dependency issue, and icon-source availability remain separate
items; passing this production build does not establish preview-runtime repair.
