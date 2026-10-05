# aim100x.fun

AI-driven idol chat demo: discover virtual idols, become a fan, then text and voice chat. Chats persist per account.

```
app/         Vite + TanStack Start web app (Vercel root)
contracts/   Foundry (Idols100x + LonelyUSD)
```

## Stack

TanStack Start, React 19, Tailwind v4, Passkey smart-account auth, MiniMax CN for chat, images, TTS, and STT. Idol persona, scenes, and plaza visibility live on-chain (`Idols100x` named fields); photos live in the Notion **Images** database (Token Id + Scene buckets).

## Run

```bash
cd app
npm install
npm run dev
```

From the repo root, `npm run dev` proxies into `app/` after install.

Open the printed local URL. Sign in with a passkey, claim LUSD from the `/me` faucet, subscribe to an idol (1 LUSD on Monad testnet), then open 私信 to chat.

Set `VITE_AUTH_ENABLED=false` to skip login locally (shared `dev-user`).

## Sign-in

Google and X are not used. Sign-in is **Passkey only** (WebAuthn / Face ID / device credential). A successful sign-in provisions or restores the user's ERC-4337 smart account; no injected wallet, seed phrase, WalletConnect, or SIWE signature is used.

**Env vars (auth)**

| Variable | Required? | What it does |
| --- | --- | --- |
| `VITE_AUTH_ENABLED` | No | `"false"` skips login (local/dev only). |
| `PAYMASTER_SIGNER` | Hosted (payments) | Grokbot EOA `0xa445BaC003026F5aDf51760CA850ad66750e90ad`. ERC-4337 paymaster gas, mint, contract broadcasts. Local/cloud: same value as `GROKBOT_WEB3_WALLET` — do not set a second payer key. |

Passkey login state is stored in the browser (localStorage). Do not set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GROK_AUTH_*`, Google OAuth, X/Twitter client secrets, or WalletConnect configuration — they are unused.

See [`app/.env.example`](app/.env.example).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (`app/`) |
| `npm run build` | Production build (`app/`) |
| `npm run typecheck` | TypeScript (`app/`) |
| `npm test` | App unit tests |
| `npm run contracts:test` | Foundry tests for `contracts/` (needs `forge`) |

Idols on the plaza come from on-chain `isPublic` + metadata; image buckets come from Notion Images when `NOTION_TOKEN` is set. If nothing is minted or public, Discover shows an empty state.

## Deploy

Vercel Root Directory is **`app`**. Framework preset: TanStack Start. No on-chain redeploy is required for this layout change; live addresses stay in [`app/src/lib/idols100x.ts`](app/src/lib/idols100x.ts).

## Contracts

`contracts/` is Foundry: OpenZeppelin **ERC-721** Idols100x (`idols100x.sol`, one token per idol) and OpenZeppelin **ERC-20** LonelyUSD (`LonelyUSD.sol`, 6 decimals, faucet / minter). Named idol fields live on-chain; Vercel `/api/metadata/{tokenId}` composes marketplace JSON. Target is **Monad Testnet** (chain id `10143`). Build/deploy notes: [`contracts/README.md`](contracts/README.md). App constants: [`app/src/lib/idols100x.ts`](app/src/lib/idols100x.ts).

## MCP

[`https://aim100x.fun/mcp`](https://aim100x.fun/mcp) is the Streamable HTTP
MCP. Codex, Claude, and Cursor connect with that URL and an `lf1.` bearer token.
Codex: `codex mcp add aim100x --url https://aim100x.fun/mcp --bearer-token-env-var LONELYFUNS_MCP_TOKEN`.
The agent signs with its software P-256 key; the server verifies against the on-chain
PasskeyAccount public key and stores nothing. Copy the Markdown from Manager → Agent account.
