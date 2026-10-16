# Strict photo verification on current main

Baseline: `9f8cc65`, after PR #18 (`ba8aa28`) and the successful-photo demo in PR #21. Both are merged. This candidate is based directly on main; it does not require the old PR #19 docs-test order. PR #20's original stacked candidate was not merged and must not be described as deployed.

## Small verification-only patch

Preserve the deployed image batch execution, sponsor identity requirement, LUSD Transfer requirement, gas policy, exact quote generation and all `934ada8` lock/replay protections. Do not change README, demo files, product execution, operation runner or schema.

Add complete ordered execution decoding instead of taking only a batch's last call. Image settlement accepts exactly the expected zero-value approval and checkout-tagged pay, or reconciles an older single tagged pay. Reject unexpected prefix/suffix calls, reversed order, modified approval target/amount, nonzero value, empty batches and multiple UserOps. Keep text-payment single-call consumers strict.

In addition to the existing sponsor and Transfer requirements, demand consistent chain ID, requested/transaction/receipt hash, block number/hash and exactly one non-removed Paid event from the collection for this APP wallet, token and amount. Outer transaction success or a Transfer alone is insufficient. Fresh media availability and the signed checkout's user/wallet/image binding remain required.

No old preparation diagnostics, docs-intro changes or execution changes are pulled into this patch. Historical empty-hash failures remain causally unconfirmed; successful batch use does not retrospectively prove an allowance error was their cause.

## Existing successful transaction, independently read-only checked

`0xf422aa67a4274ecccdced29ccdcb67ec5eb80f9969a30175c70c961f06ca2fc1` was read through the public testnet RPC proxy using only eth_getTransactionByHash and eth_getTransactionReceipt. Receipt status is `0x1`, block 71,399,348. Transaction and receipt hash/block agree. The sponsor submits handleOps to the configured EntryPoint; the single UserOp executes a two-call batch: approve the collection for 1,000,000 LUSD atomic units, then pay token 1 that amount. The collection receipt has Paid for the same APP sender, token 1 and amount.

The author reports that the photo opened in the PR #21 demo. This inspection corroborates the existing on-chain payment, not an independent authenticated browser/media ceremony. No signed checkout or media-access credential was read, so this is not a replay of the full authorization path. No new login, transaction, payment or checkout retry occurred.

## Review

Review this candidate directly against main. The overlapping old #15/#20 candidates are not prerequisites and should not be blindly merged afterward. Old #17/#19 docs tests are also not prerequisites; PR #18 already restored the README introduction position and current-main CI is green. Maintainers can retire obsolete drafts separately. No merge or deployment is performed here.

Local acceptance: full npm test **635 passed, 2 existing live-test skips, 0 failed** (193 script tests and 442 source tests passed). Typecheck and no-secret production build passed. New negative cases also ensure the existing sponsor and Transfer requirements remain enforced. No Production settings or deployments were changed.
