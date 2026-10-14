# Testnet LUSD → sponsored gas → MiniMax China text

Development branch `feat/independent-app-wallets`. This is a source/test checkpoint,
not a deployment or a claim of live funded acceptance. It supersedes older
mainnet-payment descriptions for the current text flow.

## User flow and boundaries

1. Sign in using an independently verified login identity. The server-controlled
   deterministic APP wallet is the caller and LUSD owner.
2. On `/me`, claim the existing faucet's **100 LUSD per 24 hours**. The contract
   mints to the calling APP wallet. The UI refreshes the chain balance/cooldown;
   it never grants a frontend-only balance.
3. Existing idol subscription/content authorization is retained. If needed,
   subscribe with the claimed testnet LUSD. Faucet and subscription gas are
   sponsored, so this step needs no user MON deposit.
4. Confirm **1 testnet LUSD per text message**. The backend submits a tagged LUSD
   transfer to the platform gas signer's address. Price, token, sender, recipient
   and network are server-owned policy, not browser inputs.
5. Only after verifying a successful testnet transaction, its exact calldata and
   matching LUSD `Transfer` event does the backend call MiniMax China directly.
   This is a testnet simulation of pay-per-message x402 economics, **not a claim
   that LUSD implements the mainnet x402/EIP-3009 protocol**.

The active text URL is `https://api.minimax.cn/v1/chat/completions`, using the
existing `MINIMAX_CN_API_KEY`, `MiniMax-M3`, non-streaming text and disabled
thinking. It makes one provider attempt per explicit request attempt, without
Hub/Monid or a fallback. The platform pays the MiniMax API bill separately.
The [official China documentation](https://platform.minimax.cn/docs/api-reference/text-openai-api)
confirms the CN base URL, OpenAI-compatible format, M3 and thinking control.
No real provider call was made in this task.

Mainnet Provider implementations remain in source. Their payment and delegation
entry points are still hard-disabled. Profile balance reads now use testnet LUSD;
no user mainnet USDC or MON is requested. Voice/image routes are not expanded,
funded, or claimed functional by this acceptance; text replies do not invoke them.

## Sponsorship and durable recovery

The existing platform signer prefunds a bounded native **testnet** gas budget to
an APP wallet before its allowlisted call. This is EOA gas prefunding, not a new
ERC-4337 Paymaster/Bundler integration. Each sponsored call receives a full gas
budget even if the user already has MON. Unused gas funding remains in the APP
wallet. Scope: faucet, subscription approval/subscription, and text transfer only.

Limits: 300,000 gas per sponsored APP call, maximum 200 gwei fee cap; a maximum
0.06 testnet MON transfer per call. A durable allowance caps each APP wallet at
1 testnet MON per UTC day. Reservations occur under the shared platform-signer
nonce lock before signing. A failed/crashed reservation may conservatively consume
allowance; it never enlarges it. The platform signer must have sufficient testnet
MON. Do not concurrently use its nonce outside this operation coordinator.

Both APP and sponsor transaction hashes are persisted before broadcast. A pending
or lost receipt is looked up; its request does not automatically broadcast again.
A stored failure with **zero signed hashes** can explicitly retry the same ID;
transactions with recorded hashes are retained for receipt reconciliation.

Messages are keyed by authenticated account plus UUID and bound to a normalized
content/history/idol hash. A second UUID with identical content/context resolves
to the original operation. Database uniqueness also prevents reusing one payment
hash across message records. A per-message lock prevents concurrent model calls.
Browser retries preserve the original request and history in account-scoped local
storage. They do not invent a new payment after a network error.

- Insufficient LUSD: no model call; claim on `/me`, then retry the same message.
- Payment pending: no model call; use the same message to reconcile the receipt.
- Confirmed payment + known model failure: explicit "already charged" notice;
  the same message can retry the model without another LUSD payment, maximum
  three provider attempts total.
- Success: reply is persisted and returned on retry without another payment or
  provider call. The UI clears the pending request after local reply persistence.
- Worker termination or unresolved model result: durable lock/generating state
  requires operator review. There is no blind lease takeover, automatic refund,
  automatic rebroadcast or second charge. Preserve message ID and known hashes;
  do not clear database locks until all transaction/nonces are reconciled.

The new database stores the reply for idempotent retrieval, not just payment
metadata. Account-scoped access is mandatory; retention/deletion of these private
replies and payment tombstones must be designed together to preserve replay
protection. Prompts, API keys, private keys and signed raw transactions are not
logged or stored in the new tables.

## Configuration and initialization (not performed here)

Server-only fields:

- `WALLET_MASTER_SECRET`: preserve the existing original derivation secret.
- `AIM100X_DATABASE_URL`: existing Neon database, with permission to create the
  application tables in the authorized environment.
- `PAYMASTER_SIGNER`: existing platform signer; `GROKBOT_WEB3_WALLET` remains its
  legacy fallback. Its address receives the simulated LUSD fee. Fund it with
  **testnet** MON. Do not paste its private key into chat.
- `ALCHEMY_MONAD_TESTNET_RPC_URL`: existing testnet RPC integration; no Alchemy
  implementation changes were made in this task.
- `MINIMAX_CN_API_KEY`: existing China API key, with M3 API access/quota.

Keep the selected login method's existing Privy/Mera settings, and existing
Neon/R2 idol-content configuration. Mainnet RPC/key/funding is not required for
this text workflow.

Run `npm run auth:init -w app` in the intended configured environment before
activation. Besides auth/product tables, it creates `aim_text_chat`,
`aim_gas_allowance` and `aim_gas_reservations`. **No live initialization or schema
change was executed here**, and configured values were not inspected.

## Verification

Tests run with a clean environment and mocked chain/provider/storage ports.
Final results:

| Check | Result |
| --- | --- |
| Focused suite | 26 passed, 0 failed |
| Source regression | 384 total: 382 passed, 0 failed, 2 live probes skipped |
| TypeScript | Passed |
| Production build | Passed; existing large dependency chunk warnings |
| Full `npm test` wrapper | Script stage: 175 passed, 16 pre-existing failures; source suite run independently |

Commands:

```sh
# app directory: focused billing/provider/operation policy suite
node --experimental-strip-types --import ./scripts/register-ts-paths.mjs --test \
  src/lib/testnet-chat.test.ts src/lib/x402-payment.server.test.ts \
  src/lib/auth/mainnet-disabled.server.test.ts \
  src/lib/auth/operation-runner.test.ts src/lib/auth/product-policy.server.test.ts
# repository root
npm run typecheck
npm run test:src
npm test
# app directory: production build without loading local secret files
node --input-type=module -e 'import { build } from "vite"; await build({envDir:false});'
```

Covered: zero balance/faucet/verified fee/model flow, strict forged-proof rejection,
wrong chain/token/payer/recipient/amount/calldata, duplicate/concurrent requests,
model retry limits, failed durable writes, gas prefunding with no user MON,
missing/lost gas receipts, and no mainnet/provider activity through blocked paths.
The five old mainnet execution tests now positively assert the hard block before
signing, balance/RPC reads or provider calls, including repeated attempts.

`npm test` has **16 pre-existing script failures** (175/191 pass): legacy `.grok`
app-env/OG template assumptions and missing `.grok/skills/og/references`. An isolated
archive of parent commit `2c933e2` produced the same 16 failure names and totals.
They are not bypassed or changed here; source regression runs separately.

Live Neon uniqueness/concurrency, current deployed token bytecode/faucet behavior,
funded sponsor delivery, RPC access, subscribed browser UI, and paid MiniMax
response remain unverified. These require a separately authorized integration
run. No merge, deployment, actual API charge or real blockchain transaction was
performed. Existing branch-specific Vercel Git deployment blocks are retained.
