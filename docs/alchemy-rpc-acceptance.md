# Alchemy testnet RPC acceptance

Scope: `feat/independent-app-wallets`, starting at `42ee0b8`. This is source/offline
acceptance of RPC integration only, not a deployed or live-chain acceptance.
Login, APP-wallet derivation, testnet LUSD text billing and the header wordmark
are preserved. Main remains `ac0730d`; neither Vercel Git deployment block changed.

## Routing and corrections

| Caller / purpose | Route | Network and boundary |
| --- | --- | --- |
| Browser chain reads | `/api/rpc?chainId=10143` → server Alchemy transport | Read-method allowlist; bounded logs; no signing or broadcasts |
| Server reads, APP-wallet signed broadcasts, gas funding | Server-only `ALCHEMY_MONAD_TESTNET_RPC_URL` | Exact HTTPS `monad-testnet.g.alchemy.com/v2/<key>`; verifies chain 10143 before each request |
| MCP chain reads / status | Same server Alchemy transport | Status now reports shared chain constant 10143, replacing obsolete 46630 |
| Legacy Passkey / MCP UserOperations | Independent Pimlico bundler `https://public.pimlico.io/v2/10143/rpc` | Alchemy JSON-RPC is not a bundler or paymaster service |
| Testnet APP-wallet gas sponsorship | Existing `PAYMASTER_SIGNER` server signer and Alchemy broadcast | Existing bounded MON prefunding; no Alchemy sponsorship API created |
| External wallet broadcasts | User wallet's EIP-1193 provider | Checks 10143 and signer before sending; its own node configuration remains independent of app Alchemy |
| Mainnet 143 | Rejected by browser/server transport and HTTP RPC proxy | Existing x402 spending and 7702 delegation blocks retained; no mainnet env needed |

Missing/invalid Alchemy configuration yields HTTP 503 with a fixed variable-name
message and a safe numeric error code. Browser code maps only these known codes,
never upstream messages. MCP no longer disguises missing RPC configuration as
an invalid bearer token (401). Other upstream failures remain sanitized.
Redirects are rejected; response JSON-RPC version/id and actual chain ID are
checked. No public RPC fallback exists. Server RPC rejects bundler/paymaster
methods and remote signing; only server-signed raw transaction submission is
allowed in addition to ordinary reads. Browser submission remains prohibited.

The network check adds one `eth_chainId` request per ordinary read/broadcast;
a chain-ID request itself is not duplicated. This deliberately favors immediate
wrong-network rejection over caching. Account for this in Alchemy request usage.
No live requests were made during this acceptance.

The old external-wallet auto-add path supplied a relative, read-only proxy as a
full wallet RPC. That cannot broadcast transactions. It now asks users with an
unknown chain to add Monad Testnet in their wallet settings; it never exposes
our server API key or silently substitutes a public RPC.

## Measured offline evidence

All commands ran with `env -i PATH="$PATH" HOME=/tmp`; no real environment values
or secret files were read, printed or changed. Tests use explicit synthetic keys,
mocked fetch/providers/storage and locally generated transaction fixtures. Even
signed test fixtures are delivered only to the mock, never to a network.

| Check | Result |
| --- | --- |
| Focused RPC / external-wallet / mainnet-block / MCP / login / text suite | 41 passed, 0 failed, 0 skipped |
| `npm run typecheck` | Passed |
| Production Vite build, `envDir:false` | Passed; existing large dependency chunk warning |
| Client artifact inspection | 322 JS files scanned; no Alchemy testnet host, server `process.env.ALCHEMY` access, `alchemyRpcUrl`, or fixture key |
| Built browser transport, Chromium | Successful testnet read; explicit missing-config error; upstream message sanitized; mainnet blocked before fetch |
| Browser network boundary | All requests intercepted locally; the three RPC checks hit only same-origin `/api/rpc?chainId=10143` |

Commands (first and third from `app`, typecheck from repository root):

```sh
node --experimental-strip-types --import ./scripts/register-ts-paths.mjs --test \
  src/lib/monad-rpc.server.test.ts src/lib/auth/external-wallet.test.ts \
  src/lib/auth/mainnet-disabled.server.test.ts src/lib/mcp/mcp.test.ts \
  src/lib/auth/wallet-auth-http.server.test.ts src/lib/testnet-chat.test.ts
npm run typecheck
node --input-type=module -e 'import { build } from "vite"; await build({envDir:false});'
```

The Chromium probe loaded the actual generated transport export from
`passkey-client-DzMu_WVs.js`, served generated modules via Playwright route
interception, and mocked RPC responses; it did not load the app's live services.
Temporary logs: `/tmp/aim-rpc-focused.log`, `/tmp/aim-rpc-typecheck.log`,
`/tmp/aim-rpc-build.log`, `/tmp/aim-rpc-browser.log`.

## Pending: configuration-dependent read-only acceptance

The user reports `WALLET_MASTER_SECRET`, `AIM100X_DATABASE_URL`,
`PAYMASTER_SIGNER` and `MINIMAX_CN_API_KEY` already exist. Their values and target
environment assignments were not inspected. Alchemy testnet configuration is
pending user setup. Do not create a Key, change environment configuration or
infer connectivity from this offline result.

Once the user has configured the server-only testnet URL, and separately
authorized live RPC requests against a runtime of this exact branch:

1. Record runtime revision and environment without showing secrets. Use that
   runtime's application origin, not the current production deployment by default.
2. POST `eth_chainId` to `/api/rpc?chainId=10143`; require HTTP 200 and result
   `0x279f` (10143). POST `eth_blockNumber`; require a valid nonnegative hex result.
   Repeat later to establish that the node is advancing. These are ordinary RPC
   reads and may consume Alchemy quota; no signing is involved.
3. Use `eth_getCode` for current `IDOLS100X_ADDRESS` and `LONELY_USD_ADDRESS` from
   `app/src/lib/idols100x.ts`; require nonempty code. Verify token `decimals()` is
   6 with `eth_call`, and read documented contract fields. Address/bytecode/ABI
   correctness cannot be established by URL validation alone.
4. Browser Network should show only the same-origin proxy and no API Key. Confirm
   chain 143 returns 400 before any upstream request. Against the read-only proxy,
   a dummy `eth_sendRawTransaction` request must return 400 without forwarding;
   do not send signed data or use the server's direct broadcasting interface.
5. If checking legacy account infrastructure, separately authorize bundler
   `eth_chainId` and `eth_supportedEntryPoints` reads, plus on-chain EntryPoint /
   factory / paymaster code and deposit reads. Do not call gas sponsorship or
   UserOperation submission methods. Alchemy success proves neither bundler
   availability nor paymaster funding.

Pending evidence: actual Key authorization/quota/network reachability, live
contract identities/reads, running-browser integration, bundler availability and
sponsor/paymaster funding. No transaction, MiniMax charge, deployment, database
migration or mainnet activation is included in this RPC item.

## Deferred unchanged

The previously established 16 script-test failures and old preview dependency
error remain separate backlog items. This task did not rerun or repair that script
suite, modify dependencies, merge main or deploy. The targeted build/browser
probe does not claim that the old preview runtime is repaired.
