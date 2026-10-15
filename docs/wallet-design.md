# Wallet design: current choice and alternatives

AIM100x temporarily uses a self-managed, server-derived APP wallet for each
verified login identity. The project has not adopted a paid Privy wallet setup.
This is the current implementation choice, not a claim that Privy requires a paid
plan or that EOA wallets cannot support delegated or continuous signing.

## Available provider capabilities

**Privy:** embedded wallets can authorize additional server signers, constrained
by policies, for backend actions. Its Node SDK provides createX402Client for
payment authorizations. AIM100x currently disables embedded-wallet creation and
uses Privy access tokens to establish identity; it has not installed that delegated
wallet/payment path. Privy offers free core usage; current limits and paid tiers
are published on its pricing page.

- [Additional signers and policies](https://docs.privy.io/wallets/using-wallets/signers/overview)
- [Node x402 integration](https://docs.privy.io/recipes/agent-integrations/x402)
- [Current pricing](https://www.privy.io/pricing)

**Mera:** passkey PRF output supports a secp256k1 EOA signing identity. A signing
session keeps its key in memory and supports multiple signatures until it ends;
it does not contact an authenticator for every signature. AIM100x currently signs
the login proof, ends the client session and clears its key/PRF buffers. It has no
backend delegation for that Mera signer. This lifecycle is an application choice,
not a requirement to prompt for a passkey on every chat message.

- [Mera signing sessions](https://mera.category.xyz/concepts/signing-sessions/)
- [Official Mera SDK](https://github.com/category-labs/mera)

## Identity-to-APP relationship

| Login identity | APP derivation input |
| --- | --- |
| External wallet | Verified SIWE address; existing v1 derivation remains frozen for compatibility |
| Privy | Privy namespace, App ID issuer and verified DID form a stable account ID |
| Mera | Mera namespace, stable RP and verified secp256k1 signer address form a stable account ID |

For Mera and Privy, the server combines the account ID with the original
WALLET_MASTER_SECRET under its existing domain-separated derivation. The Mera APP
wallet is associated with the Mera EOA through its verified public identity; its
private key is not derived from the Mera private key or PRF, and neither is sent to
the server. It is not a hierarchical child wallet of the Mera key.

Source: [identity.ts](../app/src/lib/auth/identity.ts),
[app-wallet.server.ts](../app/src/lib/auth/app-wallet.server.ts),
[mera-client.ts](../app/src/lib/auth/mera-client.ts),
[provider.tsx](../app/src/lib/auth/provider.tsx).

Each login method creates its own independent account. A matching email or display
name does not merge providers. Stable RP, issuer, namespace and server-secret
continuity preserve the corresponding APP address.

## Business execution today

The authenticated client requests a typed action. The server checks its session,
permissions, price bounds and replay state, derives the bound APP signer, persists
transaction evidence and executes on Monad Testnet (10143). APP private keys stay
on the server, which therefore controls these wallets. Each APP wallet delegates
via EIP-7702; `PAYMASTER_SIGNER` submits the UserOperation and pays gas within the
daily allowance and fee/gas limits. The APP wallet never needs MON.

Supported operations include LUSD faucet, subscription, tips, quoted image unlocks,
NFT mint/buy/sale listing, pricing, Agent authorization and TBA withdrawal. Direct
NFT transfers/general transfers have no app entry point. MCP chain writes remain
disabled until APP-account authorization is implemented; authorized off-chain
content operations remain available.

Text charges 1 testnet LUSD per message before direct MiniMax China generation.
This is simulated payment billing, not active mainnet x402 settlement. Mainnet RPC,
spending and delegation remain closed. These architectural statements describe
code, not completion of real provider-login or funded-transaction acceptance.
