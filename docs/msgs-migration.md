# msgs common-feature migration for aim100x

Reference: `c35bf63` (preview). All 13 feature groups were approved. The submodule points to this revision.

| Item                   | aim adaptation                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Layout              | Shared hub headers, fan cards, gutters, responsive forms and PIN keypad                                 |
| 2. Chat language       | Browser default; explicit device preference; independent from English UI                                |
| 3. English UI          | Shared UI plus aim wallet/deposit/payment messages                                                      |
| 4. Tools               | Offer only available photos, generation and configured voice; empty voice text does not read the reply  |
| 5. Restocking          | One paid generation per job; actual scene inventory and insert count; preserve PNG/WebP/JPEG            |
| 6. References          | Private R2 portrait, cover, current scene, then other images; MiniMax image-01 for anchored jobs        |
| 7. TTS                 | Browser sends token ID; verified external-wallet subscription; read latest Neon voice server-side       |
| 8. Photo availability  | Fresh metadata and R2 object check before wallet prompts; confirm tagged external transaction           |
| 9. Image library       | Private R2 originals/thumbnails and scoped Neon metadata; no browser R2 redirects                       |
| 10. Idol configuration | Private Neon author content; public allowlist; owner-only editor and role-authorized MCP                |
| 11. PIN                | Salted PBKDF2 device lock, setup/confirm, background/reload/idle lock, three failures sign out          |
| 12. Cache/usage        | Stable prompt prefix, hashed user/idol routing key, token usage logging; upstream cache hits unverified |
| 13. Statistics         | Five-second shared snapshot keyed by aim, Monad chain and collection; concurrent reads merged           |

## Storage setup and migration

Runtime requires `AIM100X_DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Supply them server-side. The Neon integration uses the `AIM100X_` variable prefix for both Production and Preview. The database reader prefers `AIM100X_DATABASE_URL` and retains `idols100x_DATABASE_URL` / `DATABASE_URL` as legacy fallbacks. The R2 bucket name is fixed in code as `aim100x`; no bucket-name environment variable is required. Keep the bucket private, without a public domain. Only idol content is stored: `idol_config` is keyed by chain, collection and token; `aim_idol_media` uses a collection scope and a composite UUID key. R2 objects are under `aim100x/<chain>:<collection>/idol-media/`. The migration creates no account tables.

Initialize the schemas:

```sh
npm run storage:init -w app
```

Inventory old contract content and Notion media without writing:

```sh
npm run config:migrate -w app
npm run media:migrate -w app
```

Review the inventory, then copy and verify:

```sh
npm run config:migrate -w app -- --apply
npm run media:migrate -w app -- --apply
npm run media:check -w app
```

The config migration reads the existing Monad collection at one block. It never sends a transaction and never overwrites an existing config row. Media migration preserves original UUIDs, metadata, ordering, and SHA-256 checksums; it never modifies Notion or overwrites application edits. Failed/ambiguous database commits retain uploaded objects for recovery. Rerun to verify/resume. The live media check removes only its own isolated fixture.

`NOTION_TOKEN` and `NOTION_IMAGES_DATABASE_ID` must be supplied explicitly for migration. There is no default source database; a missing or blank database ID fails before any Notion request. Runtime never reads/writes Notion. Initialize and migrate before deploying this storage switch; there is no silent fallback to public legacy prompts.

## Retained wallet and chain boundaries

External-wallet SIWE remains the login. That external address owns NFTs and signs testnet NFT, subscribe, tip, unlock, pricing, sale and withdrawal transactions, paying its own MON gas. The separate EOA + 7702 is only for mainnet API USDC deposits and x402 API payments. The platform only sponsors its mainnet initialization. The disabled `/api/auth/wallet/send` endpoint still rejects product transactions. No Orbio integration is copied.

Photo `pay()` calldata contains a unique checkout tag after the standard ABI arguments. This was verified with read-only Monad `eth_call`: tagged and untagged zero-amount calls both reached `InvalidPrice()` in the current contract. Confirmation checks a mined successful receipt, external sender, collection, amount, and complete calldata tag. The same transaction cannot satisfy another checkout; retry uses the stored transaction hash. Unconfirmed transactions must be checked in the wallet before another attempt.

## Completed storage migration — 2026-10-13 (America/Edmonton)

The full ordered initialization, dry-run inventory, config import, media import and live media check completed against aim's Neon project and the private `aim100x` R2 bucket. The refreshed task `AIM100X_NEON_PROJECT_ID` matches Vercel's aim resource (`bitter-dust-05325911`). Source selection was supplied explicitly through the migration process environment; no personal source ID is stored in code or this document.

| Evidence | Result |
| --- | --- |
| Legacy Monad inventory | 4 idols at block `70858546` |
| Config migration | 4 imported, 4 verified against block `70858837`, 0 existing rows overwritten |
| Notion inventory | 22 pages, 22 eligible images, 0 skipped; all have originals and thumbnails |
| Media migration | 22 imported metadata rows, 0 failures; destination initially had 0 media rows |
| Originals and thumbnails | 22 originals + 22 thumbnails; all 44 R2 SHA-256 checks passed |
| UUID and metadata preservation | All 22 source UUIDs, token IDs, scene, tags, prompt, type, rating, source timestamps and ordering timestamps verified |
| Notion source immutability | Parsed metadata fingerprints and edit timestamps match both the initial preflight and immediate pre-import baselines |
| Bucket privacy | Managed public domain disabled, no custom domains; unsigned S3 request rejected with HTTP 400 `InvalidArgument` authentication error |
| Media HTTP delivery | Representative original/thumbnail stream checks passed; no storage redirects, `private, no-store` responses |
| Authorization lifecycle | Anonymous and invalid-session protected requests rejected; valid fixture session + media ticket can stream original and thumbnail |
| Edit/archive/availability lifecycle | Upload, replacement, thumbnail clearing/recreation, type/rating update, missing-object and wrong-idol checks, archive denial passed |
| Fixture cleanup | No fixture row or object remains; final totals are 4 config rows, 22 media rows and exactly 44 R2 objects |
| Production HTTP | Actual aim100x.fun requests: authorized original/thumbnail 200; anonymous, missing-session and invalid-session protected requests 402; public metadata 200; production fixture cleaned |
| Local checks | Configuration allowlist, media HTTP and image-payment test files passed (3/3); TypeScript checking passed |

`idol_config` and `aim_idol_media` contain only idol content. Existing Neon-managed `neon_auth` tables were not populated or modified, and no account rows were read. The old `idols100x` and `msgs100x` buckets were not changed. No Notion writes, chain transactions, wallet delegation or real payments were submitted. The authorization check uses only an isolated media fixture and short-lived test session/ticket, without creating an account or settling a payment.

## Git privacy cleanup and deployment state

The two designated personal Notion IDs were removed from current migration defaults, environment examples and docs, then scrubbed from every branch's history in compact and hyphenated forms, case-insensitively. The authorized atomic force-with-lease update replaced all four remote branch tips while preserving concurrent documentation commits. A fresh remote mirror scan found zero target-ID matches across all Git objects reachable from the four branches and four GitHub PR refs. There are no tags. Recovery backups remain local and outside Git; they intentionally retain original history.

Vercel's existing Neon resource now supplies 18 `AIM100X_` variables as Secrets in Production and Preview. The runtime prefers `AIM100X_DATABASE_URL`; old names are compatibility fallbacks. `WALLET_MASTER_SECRET` remains configured as a Production Secret.

The task-environment `AIM100X_POSTGRES_HOST` still has a malformed value; it should contain only the pooled hostname from `AIM100X_DATABASE_URL`, without quotes, connection-string parts or another assignment. It is not read by this migration or runtime. `NOTION_IMAGES_DATABASE_ID` is not persistently configured; supply it explicitly for any later migration rerun.

The server-only `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` have been added to Vercel as Production/Preview Secrets with explicit user authorization. Production deployment `8281326` reached READY with these variables. Actual HTTPS verification on aim100x.fun passed for authorized original/thumbnail delivery, anonymous/invalid-session denial and public metadata. The isolated production fixture was removed; no source media or account data was changed.

Historical creative fields already on the legacy contract remain publicly readable; this migration cannot erase them. Funded AI/payment flows are outside the storage migration verification.

BlockRun's documented Grok generation route does not accept references. Default jobs with private anchors therefore use the verified Monid/MiniMax image-01 route; text-only jobs use Grok Imagine 2.0. Explicitly selecting Grok rejects anchored jobs before payment. Prompt-cache forwarding and cache savings through Monid still need funded verification. Voice design is absent from the Hub, so the editor accepts existing MiniMax voice IDs and allows voice notes to be disabled.
