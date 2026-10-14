# WIP: independent login / deterministic APP wallet acceptance

2026-10-14. Branch `feat/independent-app-wallets`, based on main
`ac0730de48688e7fdf61782cf70faf774b54def4`. Source checkpoint only; not a release.

## Preserved scope

The starting worktree had 54 tracked modifications and 22 untracked files.
All were preserved, including earlier Alchemy, product-payment and documentation
drafts. Saving those drafts does not accept or activate them. The separate
`/workspace/aim100x.fun` worktree and its four modifications were not changed.
A binary patch and untracked-file archive were saved under `/workspace/scratch`
before acceptance edits. This commit is the durable copy of the complete draft.

This pass changed only login acceptance tests, the SIWE challenge/verification
chain (Monad testnet 10143), and the mandatory mainnet spending boundary.
`paidFetch` and `ensureAppWalletDelegation` now fail before network/signing work;
there is no environment switch to enable them. Mainnet Provider source remains.
Existing README/product documentation describing enabled mainnet behavior is
historical and is superseded by this WIP boundary. It was not rewritten here.
Both Vercel config roots disable Git deployment for this development branch.

## Acceptance evidence

- Browser wallet: server-created SIWE proof, origin/domain/URI/chain/nonce binding,
  cryptographic signer verification, single-use database challenge interface.
- Privy: ES256 signature, issuer, audience, expiry/issued-at, required session ID;
  client-provided subject is ignored. Tests include wrong signing key and missing
  required claim. The verified Privy DID is the identity, never an email match.
- Mera: official SDK PRF-derived local signing key, frozen HKDF/RP domain context,
  server SIWE proof. This proves key possession, **not WebAuthn attestation or that
  an arbitrary client actually used Mera hardware**. PRF and keys stay on-device.
- Namespaces separate wallet / Privy app+DID / Mera RP+signer; no account linking.
  Repeated login yields the same account and APP address for each provider.
- Browser v1 derivation matches the base commit formula, with a frozen dummy-key
  address vector. Existing external/Passkey assets are not migrated. A changed
  master secret fails closed against existing account rows.
- Sessions are revocable; replay/concurrent replay, expired challenge, wrong
  signer, tampering, cross-origin and RP mismatch are covered locally.

Commands used with a clean process environment (no application secret files):

```sh
# From app/: focused acceptance
node --experimental-strip-types --import ./scripts/register-ts-paths.mjs --test \
  src/lib/auth/wallet-auth.server.test.ts \
  src/lib/auth/wallet-auth-http.server.test.ts \
  src/lib/auth/privy.server.test.ts \
  src/lib/auth/mera-key.test.ts \
  src/lib/auth/mainnet-disabled.server.test.ts
# From repository root:
npm run typecheck
npm run test:src
```

Results: focused suite **13 passed, 0 failed**; typecheck **passed**.
Additional source regression: **371 tests, 364 passed, 5 failed, 2 skipped**.
All five failures are the retained `x402-payment.server.test.ts` expectations
that mainnet payment execution is enabled (successful authorization, insufficient
balance, ambiguous result, pricing error, missing receipt). The new hard block
preempts those paths. Assertions were not weakened, bypassed or skipped to make
this WIP green. The two skipped tests are opt-in live chain probes. No build,
hosted browser acceptance, database initialization, or real payment was performed.

## Remaining configuration / integration limits

Values were neither inspected nor requested. Configure and verify separately:
`WALLET_MASTER_SECRET` (preserve the original), `AIM100X_DATABASE_URL`, initialized
auth tables (`npm run auth:init -w app`, NOT executed here), matching
`PRIVY_APP_ID` / `VITE_PRIVY_APP_ID`, public `PRIVY_VERIFICATION_KEY`, allowed
Privy origins, matching `MERA_RP_ID` / `VITE_MERA_RP_ID`, and HTTPS/PRF-compatible
browser/authenticator. Existing RPC draft needs the testnet Alchemy URL for
on-chain signature verification. No mainnet key/funding is needed for this task.

Mock storage tests do not prove Neon concurrency or live provider integration.
Privy login and actual Mera WebAuthn ceremonies still need hosted acceptance.
Mera RP/app namespace and master-secret recovery need operational continuity.
No claim of full-product readiness or security audit is made.

## Queued, explicitly not implemented in this pass

- Testnet LUSD simulated charging.
- Personal-page faucet workflow.
- Platform-sponsored testnet gas.
- MiniMax China API routing.
- Reconcile retained mainnet payment tests with a separately approved future
  Provider lifecycle; never enable real mainnet spending to fix these tests.

Decision: **offline login / deterministic-wallet acceptance passed**;
**hosted integration and full regression acceptance remain open**. No merge to
main, deployment, database write or real chain transaction is authorized here.
