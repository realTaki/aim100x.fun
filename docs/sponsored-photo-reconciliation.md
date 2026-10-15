# Sponsored photo reconciliation

Baseline: main `cf35691`, with docs-only PR #16 and #14 merged. At inspection PR #15 (`7ffcdb5`), #17 (`9575950`) and #18 (`be40088`) remained open. This branch combines the payment changes on our own branch; it does not modify or merge those authors' branches.

The separate `fix/readme-intro-current-main` commit (`4bc9fca`) applies the one-file product introduction test correction to current main. It preserves the Demo section's location and all product prose. Old PR #17 still targets the historical docs branch and has not shipped. This reconciliation branch is stacked on the current-main docs fix.

## Reconciled execution and proof

- Preserve PR #18's server-planned approve + checkout-tagged pay in one EIP-7702 executeBatch/UserOp and one recorded transaction hash. Delegation precedes batch simulation. Preserve gas limits, sponsorship allowance, APP signing and request/lock evidence retention from `934ada8`.
- Decode every call of the sole UserOp. The image verifier requires exactly the two expected ordered calls, exact token/spender/amount and checkout-tagged pay data, and zero native value throughout. Extra prefixes/suffixes, reordered calls, changed approvals and arbitrary targets are rejected.
- Keep the single-call decoder strict for text-payment consumers; a batch must not silently become its last call. Expose a separate complete-execution decoder for image verification.
- Preserve PR #15's exact collection Paid event and transaction/receipt chain, hash and block consistency checks. A token Transfer by itself or a successful outer handleOps receipt does not prove the checkout's inner payment. Current sender, token and amount must match exactly; removed, spoofed and duplicate Paid evidence is rejected.
- Read-only settlement for a previously submitted single tagged pay remains possible, with the same exact receipt requirements. It never submits or retries payment.
- Retain fixed preparation failure-stage labels without returning provider messages or secret-bearing URLs.

## What is and is not established

Offline tests prove valid batch receipt acceptance, malformed/extra-call rejection, retained single-call text boundaries, one-hash batch submission through the mocked RPC transport, repeated-request idempotency and stale/unknown lock preservation. A controlled runner model starts with zero allowance: approve is submitted and confirmed first, then pay succeeds. This shows that zero *initial* allowance alone is insufficient to explain the historical failed/empty-hash response; it does not reproduce the actual network/node/session/quota conditions.

The old image settlement format mismatch is confirmed by prior matched regression testing. PR #18's attribution of the historical `hashes: []` to allowance remains unconfirmed. Those responses occurred before a hash was persisted; their swallowed error cannot be reconstructed from calldata. Batch simulation with ephemeral approval is a valid design improvement, not proof of that historical cause. Existing first-failure telemetry or safe preparation-stage data is still needed; do not create a payment merely to obtain it.

Tests use synthetic identities, signatures, receipts and RPC responses. No live payment, transaction, lock cleanup, secret read, permissions change or Production deployment is part of this work. Actual executeBatch availability/atomicity on the selected deployed implementation, live nonce behavior and an authorized end-to-end photo unlock remain live acceptance items.

## Review order

Review/merge the current-main docs test PR first, then retarget/review this stacked reconciliation against main. This candidate replaces the overlapping payment changes in #15/#18; do not merge those branches on top blindly. Their original conflict remains until maintainers choose a candidate. No merge is performed here.

Local acceptance of the reconciled candidate: full `npm test` **635 passed, 2 existing live-test skips, 0 failures** (193 script plus 442 source tests passed). Typecheck and the no-secret Vite production build passed, with the existing large-chunk advisory. Tests include the retained stale/unknown-state and concurrent duplicate protections.
