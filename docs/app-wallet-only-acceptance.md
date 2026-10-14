# APP-wallet-only business audit and bounded repair

Baseline main: `30da46392dd7479df07153fb4182ffd2c3abbb42`; implementation branch
`fix/app-wallet-only-business`. The initial worktree was clean. User-supplied icons
are retained byte-for-byte, and Privy JWKS changes are outside this item.

## Identity, sender, owner and funding

External wallet, Privy and Mera provide login proofs only. The server verifies the
proof, binds an independent provider/issuer/subject account and derives its APP
key using the preserved `WALLET_MASTER_SECRET`. Browser-wallet v1 derivation stays
frozen; other identities use the existing domain-separated account namespace.
No client-chosen address, email or display field selects a signing identity.
APP keys/mnemonics do not return to the client. No cross-provider merging occurs.

| Existing entry | Business sender / authority | Payment or result |
| --- | --- | --- |
| Profile faucet | APP wallet; typed authenticated action | LUSD faucet mints to caller's APP wallet |
| Text chat | APP wallet; active session and idol access | Exactly 1 testnet LUSD to platform signer; receipt checked before direct MiniMax CN |
| Subscription / tip | APP wallet; exact bounded approval and contract action | LUSD to idol TBA |
| Quoted image unlock | APP wallet; signed quote binds payer/target/amount | Verified LUSD image payment |
| NFT mint | APP wallet; bounded approval + mint | Contract mints to msg.sender (APP wallet); mint cap is per APP wallet |
| NFT purchase | APP wallet; current price bounded by confirmation | Seller is paid; ERC-721 owner becomes APP buyer |
| NFT sale listing / price changes | APP wallet; current owner, fresh session | Exact collection methods only |
| Agent role grants/revocation | APP wallet; fresh session | Exact setAgent/removeAgent, no arbitrary approval/calldata |
| TBA withdrawal | Current owner's APP wallet, fresh session | TBA executes LUSD transfer only to that APP wallet |
| Native gas prefunding | Platform PAYMASTER_SIGNER | Funds the APP wallet before its business signature; never substitutes user MON |
| Direct NFT transfer / ERC-721 approve / general transfer | No product UI/server action implemented | Rejected by the existing typed action schema; not added here |
| Old external/Passkey executor | Explicitly disabled | No key, provider, RPC or UserOperation access |
| MCP on-chain pricing/sale / Agent executor | Explicitly disabled | No authenticated APP-account authorization exists for MCP chain writes yet |
| MCP authorized content/visibility | Existing role-based authorization retained | Off-chain Neon only; never broadcasts a transaction |
| Mainnet RPC, paidFetch / 7702 delegation | Existing hard blocks retained | No mainnet activation |

The mint/buy owner semantics were checked in `contracts/src/idols100x.sol`.
The current UI already routed its supported product operations through
`executeProductAction` → `/api/auth/wallet/send` → server APP execution. The defects
were executable legacy signing paths, MCP Agent chain writes, owner-address
fallbacks in display/manager helpers, and incomplete gas sponsorship.

## Repairs and validation

- Removed old transaction implementations, retaining compatibility functions that
  reject before provider/key/RPC access. External login signing remains in
  `auth/client.ts`. Bundler proxy no longer forwards eth_sendUserOperation.
- MCP pricing/sale reject before role reads or signing; tool descriptions and
  /docs expose the unavailability. Read/content permission checks are retained.
- Product owner helpers accept only the explicit authenticated APP wallet; missing
  APP address fails closed, including dev fallback and address-like profile text.
- Every supported business call now requires platform gas funding. The prior
  faucet/subscription-only condition and user-MON fallback were removed. Per-call
  gas is capped at 2,000,000, fee at 200 gwei, and existing daily reservation limit
  at 1 testnet MON per APP wallet per UTC day. These are conservative reserved
  budgets, not actual gas spent. Exhaustion stops rather than charging user MON.
- Simulation precedes funding/signing. Account lock serializes nonce preparation,
  session revocation is checked before signing, and signed hash evidence must be
  stored before broadcast. Existing ambiguous/replay handling remains.
- Funding body hash includes a non-default gas budget. An old pending sponsorship
  created under the previous budget may require manual reconciliation instead of
  being resumed; it is never silently funded again under changed terms.
- README and served /docs now describe current APP ownership, identity-only login,
  platform gas and testnet text. Historical mainnet/model descriptions are removed
  from those user-facing guides. No unsupported transfer or live login capability
  is claimed.

| Check | Result |
| --- | --- |
| Focused old-writer / APP sender / gas / owner / documentation suite | 26 passed plus 4 policy cases, 0 failed |
| Complete npm test | Scripts 192 passed; source 393 passed, 0 failed, 2 existing opt-in live probes skipped |
| Typecheck | Passed |
| Production Vite build with envDir:false | Passed; existing chunk-size warning |

The new APP execution test locally signs mock testnet transactions for all three
provider identities, recovers their senders, checks chain/nonce/gas budget, and
checks funding order and idempotent retries. Revoked sessions, failed sponsorship
and mismatched APP addresses cannot broadcast. Network, storage and sponsor ports
are mocked; no real credentials or transactions are used.

Temporary evidence: `/tmp/aim-app-only-focused.log`, `/tmp/aim-app-only-full.log`,
`/tmp/aim-app-only-typecheck.log`, `/tmp/aim-app-only-build.log`.

## Remaining gaps

No direct NFT transfer/general transfer is implemented. MCP needs an explicit
APP-account authorization design before restoring chain pricing/sale tools.
Existing old-wallet assets are not migrated. Previously granted on-chain Agent roles are not revoked by disabling our MCP writer; this patch does not claim to prohibit independently signed transactions outside the app. Revocation would require a separately authorized chain operation. Real provider login, database
schema/concurrency, NFT gas sufficiency and platform funding require separately
configured live acceptance. Account isolation, mainnet disablement and user icon
files are preserved. No credential, whitelist, database or contract change is
included, and no real transaction was sent.
