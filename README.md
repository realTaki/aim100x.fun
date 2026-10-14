# aim100x.fun

Discover AI idols, chat through text and voice, or create a character with its own personality and scenes. aim100x.fun combines AI roleplay with NFT ownership on Monad: fans subscribe to idols, and creators shape their content, set prices, and receive payments.

- **Fans:** subscribe to idols and open private conversations.
- **Creators:** use their APP wallet to own idol NFTs, edit content and set prices.
- **Agents:** read/edit authorized private content through [MCP](https://aim100x.fun/mcp); chain writes are currently disabled.

See [`/docs`](https://aim100x.fun/docs) for fan, creator and agent workflows.

## Accounts and payments

AIM100x currently uses self-managed, server-derived **APP wallets** for continuous backend payments. The project has not adopted a paid Privy wallet setup and is temporarily using this design; it is a project choice, not a limitation of Privy or Mera. External-wallet, Privy and Mera identities each map to an independent APP account, without automatic account merging.

**Privy** embedded wallets can support automatic backend payments through authorized additional server signers and policies, including its Node x402 client. Privy also offers free core usage. In this app, embedded-wallet creation is currently off: Privy verifies identity, and the APP wallet signs business transactions.

**Mera** provides a passkey-derived secp256k1 EOA identity and can sign repeatedly within an active signing session. This app ends that client session after the login proof and clears the key buffers; it has not integrated backend delegated signing for the Mera identity. The APP wallet therefore handles ongoing payments. Its account ID binds the Mera namespace, stable RP and verified signer address; the server combines that ID with its master secret to derive the APP private key. This links the two identities, but the APP key is **not derived from the Mera private key or PRF**.

The server signs only allowed requests from an authenticated session, checking ownership, prices and replay state. APP private keys stay on the server. All supported business operations, including NFT transactions, use the APP wallet, with platform-funded gas within its allowance.

See [wallet design and official references](docs/wallet-design.md) for the derivation details and alternatives.

**All supported business transactions use the APP wallet on Monad Testnet (10143).** This includes claiming LUSD, subscriptions, tips, image unlocks, NFT minting/buying/listing, pricing, granting/removing Agent roles and TBA withdrawal. APP-wallet ERC-20 approvals are constructed for the exact operation amount. No login-wallet transaction fallback is permitted.

The platform signer supplies the APP wallet's MON gas budget before each business transaction, within the existing **1 testnet MON per APP wallet per UTC day** allowance and fee ceiling. No user MON deposit is required. Exceeding the allowance or losing sponsorship confirmation stops the operation; it does not charge the login wallet or silently use the user's MON. Each business call is bounded to 2,000,000 gas; larger calls are rejected or revert. This is native MON prefunding, not an Alchemy Gas Manager/4337 paymaster integration.

A **one-time LUSD subscription** unlocks chat. Text uses **1 testnet LUSD per message** from the APP wallet to the platform signer, then invokes direct MiniMax China text API. This simulates request billing on testnet; it is not active mainnet USDC x402. Paid images retain their separate quoted LUSD unlock. Mainnet payments and delegation are closed.

The APP wallet owns newly minted/purchased **Idols100x ERC-721** NFTs. Its **ERC-6551 token-bound account (TBA)** holds subscription/image receipts; withdrawals return to the current owner's APP wallet. A purchase pays the seller and changes owner to the buyer's APP wallet. The underlying ERC-721 supports transfers, but a direct NFT-transfer UI/server action is not implemented. Existing assets on external or old Passkey wallets are not automatically migrated.

## AI and storage

- Text: direct MiniMax China MiniMax-M3 after verified testnet LUSD payment.
- Image/voice/STT routes retain older integrations; routes that require mainnet paid fetch remain blocked. Optional platform-paid image fallback depends on its configuration. Do not infer full media readiness from text tests.
- Neon: account/challenge/session/operation records, idol configuration and media metadata.
- R2: private originals/thumbnails. Browser chat history is isolated by APP account in SQLite WASM/OPFS.
- MCP: authorized content/visibility operations remain; pricing and sale chain writes are unavailable until APP-account authorization is implemented.

## Implementation status

This guide describes current code; offline tests and deployed anonymous-page checks are distinct from authenticated live acceptance.

- **Implemented:** external-wallet SIWE, Privy and Mera identity login adapters; independent server-derived APP accounts; APP-signed testnet LUSD and NFT operations; platform-funded gas within limits; direct MiniMax China text; private Neon/R2 content and authorized MCP content reads/edits.
- **Recorded verification:** offline login/operation/replay/ownership tests and production anonymous UI/icon smoke. Provider configuration, real passkey ceremonies, database initialization and funded business transactions need live acceptance.
- **Not implemented:** direct NFT transfers or general wallet transfers in the app; MCP chain-write authorization for an APP account; Privy automatic JWKS fallback. Legacy external-wallet, Passkey and Agent Account transaction writers are disabled. Mainnet RPC, x402 spending and EIP-7702 delegation remain disabled.

Subscriptions remain part of the product.

## Development

Node 24; React 19, TanStack Start, Vite, Tailwind v4, Nitro/Vercel; Foundry contracts.

```sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
```

Contract CI runs all 43 local assertions without RPC; live forks use an explicit profile. See [contracts CI configuration and evidence](docs/contracts-ci-acceptance.md).

Dev uses port 8080. The normal build wrapper loads local configuration; no-secret acceptance builds use the Vite API with `envDir:false` from `app`.

| Configuration | Purpose |
| --- | --- |
| `WALLET_MASTER_SECRET` | Preserve the original server secret; rotating changes APP addresses. |
| `AIM100X_DATABASE_URL` | Auth, sessions, durable operations and content. Initialize required tables separately. |
| `ALCHEMY_MONAD_TESTNET_RPC_URL` | Server-only Alchemy testnet endpoint. No public RPC fallback. |
| `PAYMASTER_SIGNER` | Platform's testnet MON funding signer and text LUSD recipient. |
| `MINIMAX_CN_API_KEY` | Direct MiniMax China text API. |
| `PRIVY_APP_ID`, `VITE_PRIVY_APP_ID`, `PRIVY_VERIFICATION_KEY` | Matching public App IDs and current server ES256 public PEM verification. |
| `MERA_RP_ID`, `VITE_MERA_RP_ID` | Matching permanent passkey RP hostname. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Private media access. |

Keep secrets out of Git and browser-prefixed variables. Privy allowed origins/login methods and Mera HTTPS/PRF compatibility require hosted verification. Auth tables are not created by deployment. See [APP-wallet audit](docs/app-wallet-only-acceptance.md), [login configuration](docs/app-wallet-auth.md) and [testnet text evidence](docs/testnet-text-acceptance.md).
