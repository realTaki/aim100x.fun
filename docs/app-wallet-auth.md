# Independent login identities and APP wallets

Development branch: `feat/independent-app-wallets`, based on main `ac0730d`. This change has not been deployed. The previous main-only documentation patch is preserved separately; this document describes the new implementation.

## Identity and custody

Each verified identity gets a deterministic internal account ID and one server-derived APP wallet:

| Login | Verified identity namespace | Verification |
| --- | --- | --- |
| Browser wallet | `wallet`, `eip155`, normalized address | Server-issued SIWE challenge and signature |
| Privy | `privy`, `privy.io/<app-id>`, verified DID | ES256 access token: signature, issuer, audience, expiry and required claims |
| Mera | `mera`, permanent RP ID, derived login-signer address | Mera PRF → domain-separated HKDF → ephemeral secp256k1 signing session; server verifies a single-use SIWE proof |

Mera uses the official `@category-labs/mera` 0.2 preview SDK. PRF output and login key remain on-device and are zeroed after the signing session. The server authenticates possession of the derived signing key, not authenticator attestation. It never receives PRF output and does not use that client key as the APP wallet key. Device recovery requires the same passkey, RP ID and frozen PRF/HKDF context. Unsupported PRF devices fail explicitly; there is no random-key fallback.

Provider namespaces never merge, even when emails or addresses match. Repeat login returns the same account. There are no link, merge or unlink flows. The internal ID is independent of the master secret. Existing product APIs still use the APP address as their chain principal; the session carries the separate internal ID for authentication, signing and operation records.

The backend controls APP private keys and can sign transactions. This is server-controlled custody, not a noncustodial wallet. A stolen master secret threatens all derived wallets; a stolen authenticated session can authorize permitted operations. Secret-manager access, backups and recovery testing are operator responsibilities. Account rows pin the derived address and fail closed on mismatches. No private keys or mnemonic phrases are stored in the database, returned to browsers or logged.

## Existing users

Browser login retains the exact old `app-wallet/v1` derivation, so its former API wallet becomes its APP wallet without changing address. Other providers use `app-wallet/v2` with an immutable namespace-derived account ID. Preserve the original `WALLET_MASTER_SECRET`: this is not a key-rotation implementation. The first account registration cannot detect a secret that was already changed before this rollout. Verify the original secret's provenance before enabling the new branch.

Old v1 session cookies are intentionally rejected; sign in again. Old external-wallet and Passkey NFTs, LUSD, memberships, approvals and Agent grants remain at their original addresses. Login neither transfers nor delegates those wallets. New product actions and ownership checks use the APP wallet. Old address-bound subscriptions are not automatically copied; a separate, explicitly approved migration design is needed for them. Browser-local chat lookup retains the verified browser identity's old address as a fallback, while new chat storage uses the internal account ID.

## Product transactions and recovery

Product calls use ordinary signed EOA transactions on Monad Testnet (`10143`), paid with the APP wallet's testnet MON. The API accepts typed product actions, not destinations, arbitrary calldata, native transfers or arbitrary delegation. Server-side policy constructs exact approvals/payments, checks current prices and ownership, caps payment/price inputs at 1000 LUSD, and sends TBA withdrawals only to the authenticated APP wallet. Agent authorization, removal, withdrawal and pricing require a session authenticated within five minutes; sign in again when prompted.

Every operation has a persisted, account-scoped request ID and payload hash. A database lock serializes wallet nonces. The hash of each signed transaction is stored before broadcasting. A lost receipt never causes an automatic second payment. A repeated request can confirm already-recorded complete transaction sets by reading receipts. Partial approval/payment sequences, missing receipts or worker termination retain the lock and require operator review; the UI displays the operation ID and known hashes. Do not delete a lock or generate another payment until every recorded transaction and nonce is reconciled. This initial implementation deliberately does not replace, rebroadcast or auto-resume a partially completed sequence.

Login challenges are single-use database records with five-minute expiry. Sessions are HttpOnly cookies, checked against revocable database records. Logout revokes the session; old bearer JWTs are not accepted. Same-origin checks apply to every authentication/product POST. A local PIN remains a screen lock, not server authorization.

Mainnet (`143`) x402 API payments are USDC EIP-3009 authorizations, with the existing 0.10 USDC per-request policy. They are not ERC-4337 UserOperations and do not require EIP-7702 delegation. The explicit `wallet/prepare` operation retains mainnet-only delegation for the APP wallet; login does not call it. Existing P-256 MCP Agent Accounts still use their own ERC-4337/Pimlico/Paymaster path. Their owner grants now come from the APP wallet; previous-owner grants do not transfer automatically.

## Configuration before testing a hosted environment

1. Preserve the existing server-only `WALLET_MASTER_SECRET` and configure `AIM100X_DATABASE_URL`. Back up before changing any account infrastructure.
2. Initialize the new auth and operation schemas with `npm run auth:init -w app` in the intended environment. This command creates only application tables; it is not run during build or login. No live database migration was executed during development. Arrange retention/cleanup of expired challenge/session rows as an operational task.
3. In Privy Dashboard, choose the app, enable the desired identity login methods, and add the exact allowed origins. Set matching `PRIVY_APP_ID` and `VITE_PRIVY_APP_ID`; copy the **public ES256 verification PEM** to server-only `PRIVY_VERIFICATION_KEY`. No Privy app secret is needed for local token verification. Embedded-wallet creation is off. Changing the Privy app ID changes the identity namespace.
4. Set matching `MERA_RP_ID` and `VITE_MERA_RP_ID` to the permanent hostname, without scheme, port or path. Use HTTPS and a PRF-compatible browser/authenticator. Development should have a separate RP/environment. Do not change RP or derivation contexts after users enroll.
5. In Alchemy Dashboard, enable Monad mainnet and testnet RPC and copy their HTTPS URLs into server-only `ALCHEMY_MONAD_MAINNET_RPC_URL` and `ALCHEMY_MONAD_TESTNET_RPC_URL`. Formats are `https://monad-mainnet.g.alchemy.com/v2/<api-key>` and `https://monad-testnet.g.alchemy.com/v2/<api-key>`. Do not expose them with a `VITE_` prefix. The app rejects missing, wrong-network or non-Alchemy endpoints.
6. Keep existing media/AI settings. Optional `MINIMAX_CN_API_KEY` enables platform-paid fallback for unpaid chat/image failures unless `AIM_TEMP_MINIMAX_FALLBACK=false`; this does not charge user USDC. Submitted/settled/uncertain payments never trigger fallback.

Browser reads go through a bounded read-only `/api/rpc` proxy. Server reads/writes, x402 balance checks, explicit 7702 initialization and MCP chain reads use Alchemy directly. Pimlico remains the MCP bundler; changing RPC does not install an Alchemy bundler or Paymaster. Foundry and maintenance scripts use the testnet Alchemy environment variable too. No default public RPC is retained for app traffic.

This branch disables its own automatic Vercel Git deployment in both Vercel config roots. No deployment, service registration, credentials creation or real chain transaction is part of this delivery. Bounty rules were not supplied; Alchemy integration is not a claim of bounty qualification.

## Verification boundaries

Offline tests cover provider isolation, signature checks, single-use challenges, session revocation, deterministic/legacy derivation, product target/amount/ownership policy, durable operation ordering and RPC routing/errors. Hosted Privy/Mera browser ceremonies, live database concurrency/recovery, Alchemy connectivity, funded EOA product calls, x402 settlement and explicit 7702 delegation require separately configured integration testing. Do not infer those results from mocked tests.

Official references: [Mera SDK](https://github.com/category-labs/mera), [Privy access tokens](https://docs.privy.io/authentication/user-authentication/access-tokens), [Alchemy Monad](https://www.alchemy.com/rpc/monad), [Alchemy Monad Testnet](https://www.alchemy.com/rpc/monad-testnet).
