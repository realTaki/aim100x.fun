# Operation recovery safety

PR #10 was merged as `aecf776`; the recovery risks remained on main `57c4204`, including after the EIP-7702 sponsorship changes in PR #11. This correction preserves that newer execution path.

Previously a pending operation older than 60 seconds could lose its database row and wallet lock. An incomplete hash list was recovered without querying existing receipts; a complete list could be recovered when receipts were absent or RPC queries failed. Restarting the plan could repeat a completed step or payment.

## Corrected behavior

- Never delete an operation row as part of lookup or lock acquisition. Keep the request ID, payload hash, ordered transaction hashes, expected count and timestamps.
- Never reclaim a pending or orphan lock based on age. An empty pending row may still belong to a live writer between locking, signing and recording its first transaction. An incomplete hash list may include successful calls and a live next step.
- Reconcile every recorded hash, including partial sequences. Report current receipt observations with the result. Missing receipts (`null`) and RPC errors (`unavailable`) remain distinct observations; neither authorizes replay.
- Return `pending` with `reason: verification-required` for unresolved execution. Do not replan, sign, send, replace or automatically resume it.
- Finalize only when every expected hash has a certain success/reverted receipt. Release the finished lock while retaining the operation record and hashes. A replay of the same request returns its terminal result.
- A known failure before submission stays failed; its writer releases its own lock. The browser may then ask the user to confirm a fresh request. For submitted failures, retain the browser request ID and show a review warning.

This intentionally favors withholding execution over automatic recovery. A genuinely dropped transaction, interrupted partial operation or orphan lock can remain blocked. Resolving those cases needs a separate reconciliation procedure with transaction/nonce evidence and assurance that the original worker cannot resume. TTL, a provider's missing receipt or its local mempool retention policy cannot supply that evidence. This change does not clear existing Production records or locks.

## Offline regression verification

`operation-store.server.test.ts` exercises the production SQL decision path with an in-memory database, recorded transaction side effects and network access explicitly forbidden. It covers:

- A confirmed A followed by failure before signing B; concurrent retries leave execution at A rather than A,A,B.
- A submitted payment whose receipt is absent or whose RPC lookup throws; same-ID and new-ID retries cannot send again.
- A live writer paused before its next hash, old empty pending rows and orphan locks; another request cannot steal their lock.
- Complete receipts and repeated requests, certain reverts, mixed known/unknown receipts, payload mismatch, failed-before-submission rows, and competing writers after completion.

The focused runner and stale-decision tests also retain durable-before-broadcast, no-send-on-storage-failure and terminal-request idempotency checks. The full source suite includes wallet login/provider isolation, mocked sponsored faucet sends, subscription planning and EIP-7702 execution tests. No test in this recovery suite uses a real database, secret, signature service or chain transaction.

Run the focused tests from `app` with an empty environment:

```sh
env -i PATH="$PATH" HOME=/tmp node --experimental-strip-types --import ./scripts/register-ts-paths.mjs --test src/lib/auth/operation-runner.test.ts src/lib/auth/stale-operation.test.ts src/lib/auth/operation-store.server.test.ts
```

Live database concurrency, actual transactions and manually reconciling already-stuck operations are outside this verification.

Local acceptance on the corrected source: focused recovery tests **17 passed**; full `npm test` **617 passed, 2 existing live-test skips, 0 failures** (193 script tests and 424 source tests passed). Typecheck and the no-secret Vite production build passed. The build reports the existing large-chunk advisory.
