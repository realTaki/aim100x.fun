# Sponsored image unlock verification

Base: main `41ea8f0` (PR #12 and #13 merged). PR #14 at `646d6ae` remains open and contains a demo report, not a payment implementation fix. At inspection there was no other published open fix PR or fix branch.

## Confirmed defect and correction

`settleImagePayment` still expected a direct APP-wallet transaction to the collection. Current EIP-7702 execution instead returns the sponsor's outer `EntryPoint.handleOps` hash. A legitimate sponsored image payment therefore could not pass final image authorization.

The corrected verifier decodes the one-operation handleOps and its inner Simple7702 execute call. It binds sender, collection, zero native value and the exact checkout-tagged pay calldata to the signed image ticket. It checks chain, hash, block, transaction/receipt consistency and requires exactly one non-removed `Paid(APP wallet, token ID, amount)` event from the collection. Outer transaction success alone cannot prove inner payment success. A confirmed receipt can be checked again read-only; no payment is submitted by settlement.

A regression test using a valid sponsored transaction fails against the unmodified base with `Payment does not match this photo checkout`, and passes with this correction. Negative fixtures cover other APP senders, approval calldata instead of payment, multiple UserOps, wrong chain/target/hash/block, another checkout, reverted outer receipts, missing/removed/duplicate/spoofed Paid logs and wrong amounts. Media availability checks remain required.

## Separate unresolved observation: failed with no hashes

The PR #14 demo reports `wallet/send` returning `failed` with `hashes: []` twice. That is a pre-submission preparation failure; it is earlier than settlement. **The verifier correction does not establish or fix the cause of those two historical responses.** The runner discarded preparation errors, and a read-only Vercel runtime-error query for `/api/auth/wallet/send` found no error clusters in the selected 24-hour window.

This branch returns a bounded `failureStage` on the initial preparation failure: `session`, `simulation`, `delegation`, `gas-reservation`, or `signing`. Provider error messages, signed bytes, keys and secret-bearing URLs are never returned. These labels do not change request IDs, automatic retry policy, lock handling or gas allowance. Offline tests distinguish a simulated preflight revert from an exhausted reservation, preserve empty hashes, and assert provider diagnostics do not escape. Repeated terminal requests still return their stored status; failure stages are diagnostic response fields, not a new database migration.

## Boundaries and remaining acceptance

The `934ada8` evidence retention and no-stale-replay protections remain unchanged, as do the EIP-7702 signer, gas limits and allowance. No live payment, retry, lock cleanup, credential access, merge or Production deployment is part of this work. A branch push may receive the repository's existing automatic Preview deployment; no settings are changed.

After review/merge under separate authorization, the remaining live acceptance requires an authorized operator to reconcile any existing image checkout before paying again. The historical empty-hash failure needs a safe failure-stage result or equivalent existing telemetry. Do not recreate payment solely to gather diagnostics. Actual photo unlock success remains unverified until an authorized receipt and media fetch complete.

Local acceptance: focused image/executor/runner/store tests **24 passed**; full `npm test` **627 passed, 2 existing live-test skips, 0 failures** (193 script tests plus 434 passing source tests). Typecheck and the no-secret Vite production build passed. The build retained the existing large-chunk advisory. All transaction, receipt and provider-failure evidence in these tests is simulated.
