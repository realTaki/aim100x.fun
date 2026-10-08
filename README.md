# aim100x.fun

AI-driven idol chat demo: discover virtual idols, become a fan, then text and voice chat. Chats persist per account.

```
app/         Vite + TanStack Start web app (Vercel root)
contracts/   Foundry (Idols100x + LonelyUSD)
```

## Stack

TanStack Start, React 19, Tailwind v4, External-wallet SIWE login, derived EOA + EIP-7702, and user-funded Monad mainnet x402 API payments. Idol persona, scenes, voice and plaza visibility live in private Neon; images and thumbnails live in private R2. NFT ownership, agent roles, prices and payments remain on-chain.

## Run

```bash
cd app
npm install
npm run dev
```

From the repo root, `npm run dev` proxies into `app/` after install.

Sign in with an injected external wallet, deposit Monad **mainnet USDC** into the API wallet shown on `/me`, and claim **testnet LUSD** separately for NFT subscriptions and tips. API calls spend the derived wallet’s USDC without further wallet prompts. NFT/product payments prompt the external wallet and never spend the API wallet’s balance.

Set `VITE_AUTH_ENABLED=false` to skip product login locally (shared `dev-user`). Paid AI always requires an authenticated wallet.

## Sign-in

Connect an external wallet and sign a five-minute SIWE challenge. The server verifies the signature, derives a stable application EOA from its master secret and the external address, and sponsors EIP-7702 initialization of that API wallet on Monad mainnet (`143`) only. The external wallet is the product account: it owns NFTs, holds testnet LUSD, and signs minting, purchases, subscriptions, image unlocks, tips, edits, agent authorization, faucet claims and withdrawals on Monad testnet (`10143`). It pays its own MON gas for those calls and is never delegated by the app.

Login uses a signed, 24-hour, HttpOnly, Secure, SameSite=Strict cookie. No account table, browser-held bearer token, Neon account data, or R2 account data is created. The server reconstructs the application signing key when needed; this is a **server-controlled wallet**. Back up its master secret: changing it changes every derived wallet address and prevents access to funds in previous wallets.

| Variable               | Required? | What it does                                                                                                                                                                         |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WALLET_MASTER_SECRET` | Yes       | Stable, cryptographically random 32-byte hex secret, server only. Use the same secret across instances serving the same wallets. Never commit it or expose it with a `VITE_` prefix. |
| `PAYMASTER_SIGNER`     | Yes       | Gas sponsor private key. Needs mainnet MON for one-time API-wallet 7702 initialization. Never sponsors product transactions. Falls back to `GROKBOT_WEB3_WALLET` locally/cloud.      |
| `X402_CHAT_MODEL`      | No        | BlockRun model id: `xai/grok-4.3` (default, same model as msgs) or `minimax/minimax-m3` (aim’s previous chat model).                                                                 |
| `X402_IMAGE_MODEL`     | No        | Unset: Grok Imagine 2.0 for text-only jobs, MiniMax `image-01` for reference jobs. Explicit Grok rejects reference jobs.                                                             |
| `VITE_AUTH_ENABLED`    | No        | `"false"` skips product login locally; it does not grant paid AI access.                                                                                                             |

Mainnet API payments use USDC at `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`. The x402 client accepts only allowlisted providers, Monad mainnet, this token, EIP-3009 authorization, and a **0.10 USDC maximum per API request**. This is not a per-turn or daily cap: a turn can make multiple requests. The provider/facilitator submits the USDC authorization; the app wallet need not hold MON for API payment. NFT and product calls are submitted directly by the external wallet. ERC20 approval and the following product transaction are separate wallet confirmations; the app waits for each successful receipt before continuing. The old server-side `/api/auth/wallet/send` endpoint refuses product calls.

Chat uses BlockRun through Monid, with the same Grok 4.3 model and OpenAI-compatible tool calls as msgs. Text-only images use Grok Imagine 2.0 via Monid → BlockRun; jobs with private character references use MiniMax image-01. Explicitly selecting Grok rejects reference jobs before payment. Speech-2.8-turbo also uses Monid; transcription uses ElevenLabs through Orthogonal. Asynchronous Monid results are retrieved with SIWX without paying again. Ambiguous paid requests are never retried automatically. Pricing errors, insufficient balance, unexpected offers, or missing settlement receipts fail closed. Voice design is currently unavailable through these Hub routes; existing voices still support TTS.

BlockRun’s live model catalog lists both chat model IDs. Monad Hub lists Monid’s BlockRun chat route; unsigned probes returned a Monad mainnet USDC x402 quote. Monid also returned a mainnet USDC quote for BlockRun’s Grok Imagine 2.0 generation route and returned 404 for an unknown route. The latest public endpoint manifest omits the chat and generation routes, so paid upstream execution still needs an integration check. No live payment or delegation was executed during implementation. Grok STT/asr-1.0 were not found in the verified routes. Existing Passkey accounts retain their old addresses and assets; external-wallet login uses the external address for NFT ownership and permissions, plus a separate API EOA. Existing NFTs or LUSD in a previous application/Passkey wallet are not transferred automatically. The existing MCP agent’s P-256 account is separate.

See [`app/.env.example`](app/.env.example).

## Scripts

| Command                  | What it does                                   |
| ------------------------ | ---------------------------------------------- |
| `npm run dev`            | Dev server (`app/`)                            |
| `npm run build`          | Production build (`app/`)                      |
| `npm run typecheck`      | TypeScript (`app/`)                            |
| `npm test`               | App unit tests                                 |
| `npm run contracts:test` | Foundry tests for `contracts/` (needs `forge`) |

The plaza combines Monad NFT ownership/prices with private Neon configuration and R2 media. Only display fields leave public catalog APIs. Notion is used only by the migration scripts.

## Deploy

Vercel Root Directory is **`app`**. Framework preset: TanStack Start. No on-chain redeploy is required for this layout change; live addresses stay in [`app/src/lib/idols100x.ts`](app/src/lib/idols100x.ts).

## Contracts

`contracts/` is Foundry: OpenZeppelin **ERC-721** Idols100x (`idols100x.sol`, one token per idol) and OpenZeppelin **ERC-20** LonelyUSD (`LonelyUSD.sol`, 6 decimals, faucet / minter). The currently deployed legacy contract still contains old named fields. New creative configuration is private Neon data; Vercel `/api/metadata/{tokenId}` composes marketplace JSON. Target is **Monad Testnet** (chain id `10143`). Build/deploy notes: [`contracts/README.md`](contracts/README.md). App constants: [`app/src/lib/idols100x.ts`](app/src/lib/idols100x.ts).

## MCP

[`https://aim100x.fun/mcp`](https://aim100x.fun/mcp) is the Streamable HTTP
MCP. Codex, Claude, and Cursor connect with that URL and an `lf1.` bearer token.
Codex: `codex mcp add aim100x --url https://aim100x.fun/mcp --bearer-token-env-var LONELYFUNS_MCP_TOKEN`.
The agent signs with its software P-256 key; the server verifies against the on-chain
PasskeyAccount public key and stores nothing. Copy the Markdown from Manager → Agent account.

Verified catalogs: [Monad Hub feed](https://app.monad.xyz/agents/api-hub/feed.json), [BlockRun live models](https://blockrun.ai/api/v1/models), [MiniMax on Monid](https://api.monid.ai/public/v1/endpoints?provider=minimax).

## Common features migrated from msgs

Reference `c35bf63`: English UI, shared hub layout, browser-default chat language, capability-aware tools, single-photo restocking, reference selection, current server-side TTS voice, private R2 media, private Neon configuration, local PIN privacy lock, prompt-cache identifiers/usage logging, and five-second shared statistics.

The local PIN is a screen privacy lock, not wallet authentication. It locks on reload, backgrounding and 60 seconds without interaction; three failed PINs sign out. A new external-wallet signature resets the failure counter. Changing a language explicitly saves a device preference; saving a bio alone does not freeze the browser default.

Anchored photo jobs use the verified MiniMax `image-01` route by default. Text-only jobs use Grok Imagine 2.0. Explicitly selecting Grok does not enable references: its verified generation route does not support them. Prompt prefixes and hashed `prompt_cache_key` are implemented; cache forwarding/hits through Monid require funded upstream verification. Usage logs contain token counts and purpose, never wallet addresses or prompts.

NFT/image payments are always ordinary external-wallet transactions. Photo availability is checked before requesting wallet signatures. Payment calldata carries a unique checkout tag after the standard `pay` arguments, and receipt confirmation verifies the sender, collection, amount and tag. Retries reconfirm the stored hash without another payment. The app sponsors only mainnet API-wallet initialization.

Storage setup, dry runs, migration commands and remaining live checks: [migration guide](docs/msgs-migration.md). Runtime requires Neon/R2 configuration and initialized schemas before deployment. This implementation has not copied real data or redeployed the NFT. Historical content already published on the legacy contract remains public.
