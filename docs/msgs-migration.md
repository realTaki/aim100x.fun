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

Runtime requires `idols100x_DATABASE_URL` (or `DATABASE_URL`), `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. Supply them server-side. Keep the bucket private, without a public domain. Only idol content is stored: `idol_config` is keyed by chain, collection and token; `aim_idol_media` uses a collection scope and a composite UUID key. R2 objects are under `aim100x/<chain>:<collection>/idol-media/`. There are no account tables.

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

Read-only inventories succeeded: **4 legacy Monad idols** at block `69118313` and **22 Notion images** (22 eligible, zero skipped). No destination writes were made.

## Live verification still required

### Migration preflight — 2026-10-13 (America/Edmonton)

Latest `main` inspected: `6fa2cdc`. Fresh read-only inventory found **4 legacy Monad idols** at block `70850762` and **22 Notion images**, all eligible, with **22 originals and 22 thumbnails**, zero skipped pages and zero missing original URLs. A local hash/timestamp baseline was captured to check that Notion remains unchanged; no source content or credentials were committed.

The configured R2 account contains `idols100x` and the separate `msgs100x` bucket. `idols100x` has its managed public domain disabled and no custom domains. Read-only S3 listing succeeded: 44 existing objects, none under the new `aim100x/` prefix. Existing objects must remain untouched. `R2_BUCKET_NAME` is absent from the task environment; migration commands should explicitly select `idols100x` once destination identity is confirmed.

Neon destination identity is **awaiting confirmation**. Use `AIM100X_DATABASE_URL` as the command-local `DATABASE_URL`; do not fall back to another project's database. Its hostname is `ep-round-shape-b8novoaj-pooler.c-14.us-east-1.aws.neon.tech`. The supplied `AIM100X_NEON_PROJECT_ID` contains an Auth URL rather than a project ID. Vercel associates aim100x.fun with store `store_XGU8pOxZe2lydv08` / Neon project `bitter-dust-05325911`; sensitive values cannot be read back from Vercel to establish an exact connection-string match. Confirm the supplied database belongs to aim before any destination writes.

A schema-only inspection found existing Neon-managed `neon_auth` tables and no idol content tables. No account rows were read or written. This migration creates only `idol_config` and `aim_idol_media`; it must not populate or change account tables. `WALLET_MASTER_SECRET` is present and was separately added as a Production Secret to Vercel aim100x.fun.

Focused configuration allowlist, media HTTP, UUID and image-payment test files passed (4/4); TypeScript checking passed. **No migration schemas, configuration rows or media objects have been written**, and live `media:check` remains pending. After confirming Neon identity, run the full ordered sequence above, then verify source UUIDs/metadata, original and thumbnail checksums, source immutability, private access and fixture cleanup. Record actual imported/preserved counts before marking the migration complete.

No NFT was redeployed, no wallet delegation was submitted, and no API or product payment was made. Historical creative fields already on the legacy contract remain publicly readable; this migration cannot erase them.

BlockRun's documented Grok generation route does not accept references. Default jobs with private anchors therefore use the verified Monid/MiniMax image-01 route; text-only jobs use Grok Imagine 2.0. Explicitly selecting Grok rejects anchored jobs before payment. Prompt-cache forwarding and cache savings through Monid still need funded verification. Voice design is absent from the Hub, so the editor accepts existing MiniMax voice IDs and allows voice notes to be disabled.
