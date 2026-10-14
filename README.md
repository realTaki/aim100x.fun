# aim100x.fun

Discover AI idols, chat through text and voice, or create a character with its own personality and scenes. aim100x.fun combines AI roleplay with NFT ownership on Monad: fans subscribe to idols, and creators shape their content, set prices, and receive payments.

- **Fans:** discover public idols, subscribe, and open private conversations with text, voice notes, and photos.
- **Creators:** own an idol NFT, edit its persona and scenes, manage media and prices, and offer the NFT for sale.
- **Agents:** manage authorized idols through the [MCP endpoint](https://aim100x.fun/mcp).

See [`/docs`](https://aim100x.fun/docs) for fan, creator, and agent workflows.

## Accounts and payments

Two wallets serve different purposes:

| | Product wallet | API wallet |
| --- | --- | --- |
| Control | Your connected external wallet | Separate EOA derived and controlled by the server |
| Network | Monad Testnet (`10143`) | Monad mainnet (`143`) |
| Funds | LUSD for subscriptions, images, tips, minting and NFT purchases; MON for gas | USDC for x402 AI requests |
| Approval | Wallet signatures for product transactions; token approval can require a separate confirmation | Automatic API payments after funding; platform sponsors EIP-7702 initialization only |

Sign in by signing a five-minute SIWE challenge. A signed, 24-hour HttpOnly, Secure, SameSite=Strict cookie identifies the session. The external wallet owns the NFTs and is never delegated by the app. The six-digit device PIN is a screen privacy lock, separate from wallet authentication.

A **one-time LUSD subscription** (default 1 LUSD, configurable by the creator) unlocks an idol’s chat. Paid images are charged separately. AI API requests additionally use **mainnet USDC through x402**: this is request-level billing, not a fixed charge per chat message. One turn may make multiple requests. The client accepts allowlisted providers, Monad mainnet USDC and EIP-3009 authorization, with a **0.10 USDC cap per API request**. That cap is neither a per-turn nor a daily limit. Ambiguous paid requests are not automatically retried.

Each **Idols100x ERC-721** has an **ERC-6551 token-bound account (TBA)** receiving subscription and image-unlock LUSD. Transferring the NFT changes control of the idol and its TBA; assets stay at the same TBA address. NFT purchases pay the seller directly. Creative content is stored off-chain and access follows current ownership; browser chat history is not transferred with the NFT. Existing Passkey-wallet assets are not migrated automatically.

## AI and storage

- Chat: Grok 4.3 through Monid → BlockRun by default; MiniMax-M3 is selectable.
- Images: Grok Imagine 2.0 for text-only jobs; MiniMax image-01 for private reference images. Explicit Grok selection rejects reference jobs before payment.
- Speech: MiniMax Speech-2.8-turbo through Monid; transcription through Orthogonal/ElevenLabs. Voice design is unavailable through these routes; creators can save an existing voice ID or disable voice notes.
- Content: private Neon idol configuration and media metadata; private R2 originals and thumbnails. Runtime does not use Notion; Notion is a migration source only. Chat history stays in this browser through SQLite WASM/OPFS, separated by account.

A temporary MiniMax bridge can handle unpaid chat/image failures, including insufficient USDC. It uses the platform’s `MINIMAX_CN_API_KEY`, so fallback requests do not charge the user’s USDC wallet. It defaults on when that key exists; `AIM_TEMP_MINIMAX_FALLBACK=false` disables it. Submitted, settled, or uncertain payments do not trigger fallback. Login and content permissions still apply; voice/STT are unchanged.

## Implementation status

This guide describes the current main branch. Implemented code and verified production behavior are distinct:

- **Implemented:** external-wallet SIWE login, a separate server-controlled EOA + EIP-7702 API wallet, mainnet USDC x402 requests, testnet LUSD subscriptions and NFT payments, private Neon/R2 content, and P-256 MCP authorization.
- **Recorded verification:** the storage migration report documents 4 idol configurations, 22 images with originals and thumbnails, and production media-access checks. Funded AI requests, wallet delegation, and upstream prompt-cache savings are outside that verification.
- **Under consideration, not implemented in main:** the proposed Mera single-passkey/derived-account flow, per-idol scoped keys, Privy login, Alchemy integration, and KIMI inference. Privy exists on a separate branch; the KIMI write-up is a placeholder. These are research or development candidates, not released capabilities or delivery commitments.

Subscriptions remain part of the product. Removing them in favor of message-only billing would be a product change, not a description of current behavior.

See the [migration and verification report](docs/msgs-migration.md) for recorded evidence and remaining live checks. Historical creative fields on the legacy contract remain public.

## Development

```text
app/         React 19 + TanStack Start + Vite + Tailwind v4; Nitro/Vercel
contracts/   Foundry: Idols100x (ERC-721) and LonelyUSD (ERC-20)
```

Use Node 24, matching CI. From the repository root:

```bash
npm ci
npm run dev
```

The development server listens on port 8080. Configure server-side services before using authenticated or paid flows; see `app/.env.example`. `VITE_AUTH_ENABLED=false` bypasses product login locally using a shared development user, but paid AI still requires an authenticated wallet.

| Variable | Purpose |
| --- | --- |
| `WALLET_MASTER_SECRET` | Stable server-only 32-byte hex secret for derived API wallets. Back it up: rotating it changes derived addresses and access to existing funds. |
| `PAYMASTER_SIGNER` | Mainnet MON sponsor for API-wallet initialization; falls back to `GROKBOT_WEB3_WALLET`. Does not sponsor external-wallet product transactions. |
| `X402_CHAT_MODEL` | `xai/grok-4.3` (default) or `minimax/minimax-m3`. |
| `X402_IMAGE_MODEL` | Optional image routing override; default selection depends on whether the job has a reference. |
| `AIM100X_DATABASE_URL` | Private Neon configuration and media metadata. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Private R2 access; the bucket is fixed as `aim100x`. |
| `MINIMAX_CN_API_KEY`, `AIM_TEMP_MINIMAX_FALLBACK` | Optional temporary chat/image fallback described above. |

Keep secrets server-side and out of Git. Storage schemas and content must be initialized for a new environment; follow the [migration guide](docs/msgs-migration.md).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app |
| `npm run typecheck` | TypeScript checks |
| `npm test` | Script and app unit tests |
| `npm run test:src` | App source tests |
| `npm run contracts:test` | Foundry tests; requires Forge |
| `npm run build` | Production build and Vercel output sync |

## Contracts and hosting

Vercel Root Directory is `app`. Contract addresses are configured in [`idols100x.ts`](app/src/lib/idols100x.ts). Product contracts target Monad Testnet: Idols100x is an OpenZeppelin ERC-721 and LonelyUSD is a 6-decimal ERC-20. The legacy collection retains its old named fields; new creative configuration comes from Neon. See the [contract guide](contracts/README.md) for contract tooling and historical deployment details.

## Agent MCP

Connect Codex, Claude, or Cursor to `https://aim100x.fun/mcp` using Streamable HTTP and an `lf1.` bearer token. Create and authorize a separate software P-256 Agent Account in Creator Center → Agent account, then copy its connection configuration.

```bash
codex mcp add aim100x --url https://aim100x.fun/mcp --bearer-token-env-var LONELYFUNS_MCP_TOKEN
```

MCP verifies the signed proof and binds the Agent Account through its factory and, when deployed, its on-chain public key. Signing keys supplied for writes stay in request memory. **Content** authorization permits content and visibility edits; **Full** also permits price changes. Authorization follows the NFT owner across all idols they own, rather than using a separate key per idol. Content changes save to Neon; pricing uses the separate ERC-4337 Agent Account. MCP does not expose minting, NFT transfers, chat, media uploads, or withdrawals.
