# LonelyFuns contracts

One on-chain collection: **Idols100x** (`contracts/src/idols100x.sol`), an OpenZeppelin **ERC-721** where **each token is one idol**. LonelyUSD is OpenZeppelin **ERC-20**. Explorers detect both via the standard interfaces.

**Target chain: Monad Testnet** ([official network page](https://docs.monad.xyz/developer-essentials/testnet)). Live `eth_chainId` on the public RPC is `0x279f` = **10143**.

| | |
| --- | --- |
| Chain ID | `10143` (`0x279f`) |
| RPC | `https://testnet-rpc.monad.xyz` (hardcoded in `foundry.toml` / `app/src/lib/idols100x.ts`; not a Vercel env var) |
| Explorer | https://testnet.monadvision.com (also https://testnet.monadscan.com) |
| Faucet | https://faucet.monad.xyz |
| Currency | MON |

The app uses Passkey ERC-4337 accounts for sign-in and on-chain actions.

## Token model

Canonical identity is the ERC-721 **token id**. Display name is the named field `name` (mutable). There is no slug, `notionPageId`, or `idolMetadataJson` blob.

| On-chain field | Rule |
| --- | --- |
| `tokenId` | Sequential, starts at `1`. `tokenURI` = `baseURI` + decimal id (`/api/metadata/{id}`). |
| `name`, `bio`, `personality`, `look`, `voice`, `website`, `twitter` | Named strings. Owner, Content Agent, or Full Agent writes via `setIdolContent`. Empty `website` / `twitter` is allowed. |
| `welcome` | 欢迎词. Additive named string (`welcomeOf` / `setWelcome`). Not part of `idolOf`. Separate from scene `opening`. |
| `scenes` | JSON array of scene objects (named string field, not a catch-all blob). |
| `subscribePriceUsdc`, `imageUnlockPriceUsdc` | uint256 USDC 6-decimal atomic (default `1_000_000`). Owner or Full Agent writes via `setIdolPricing`. |
| `isPublic` | Plaza / service visibility (公开). Default `false` on `mint()`. Canonical: `publicOf` / `setPublic`. Aliases: `listedOf` / `setListed`. |
| `salePriceUsdc` | uint256 LUSD 6-decimal atomic. `0` = not for sale. Defaults 1–4 are priced at `20_000_000` (20 LUSD) after deploy. |
| fan → token ids, token id → `subscriberCount` | The only two subscribe maps. |

Demo tokens 1–4 (`Natalie100x`, `moonlit_only`, `afterhoursx`, `waiteduh`). Transfers move ownership only — token id is stable.

`mint()` pays **20 LUSD** (`20_000_000`) and mints one idol to the **caller**. Max **4 mints per account**, max supply **100**. Hidden from plaza and not for sale until the owner sets those fields. The deploy wallet mints tokens 1–4 to itself, then writes content/pricing, calls `setPublic`, and sets sale prices to 20 LUSD for fans to `buy()` on the idol page. Do not mint to `address(this)` or `0xe541`. Do not steal/move tokens 1–4 on a prior collection.

## Agent authorization

Each NFT owner may register one Agent Account with `setAgent(agent, role)`. The authorization follows the owner rather than an individual token, so it applies to every idol currently or later owned by that address. `Content` may update content and plaza visibility; `Full` may additionally update subscription, unlock, and sale prices. `removeAgent()` revokes the active Agent Account. NFT transfer immediately switches authorization to the new owner's Agent Account because every write resolves `ownerOf(tokenId)`.

Ownable owner / minter: `0xa445BaC003026F5aDf51760CA850ad66750e90ad`.

App-side constants: `app/src/lib/idols100x.ts`. Live Monad testnet (this branch deploys a new collection; superseded addresses stay listed):

| | |
| --- | --- |
| **LonelyUSD** (`LUSD`, OpenZeppelin ERC-20, 6 decimals, faucet 100 / 24h) | [`0x2Ae96dD73d5Cf8f431f2d6e0cf893Db4D64262E8`](https://testnet.monadvision.com/address/0x2Ae96dD73d5Cf8f431f2d6e0cf893Db4D64262E8) |
| **Idols100x** (OpenZeppelin ERC-721; canonical Tokenbound v3; `mint()` to caller; 欢迎词; MiniMax voice) | [`0xeB88B15911431c4F3903F5780AB584E7CD6022cB`](https://testnet.monadvision.com/address/0xeB88B15911431c4F3903F5780AB584E7CD6022cB) |
| Superseded (欢迎词; token 1 sold with the `eve` voice) | [`0x2b05F714A573C576B69613928Ff1688d152e25F0`](https://testnet.monadvision.com/address/0x2b05F714A573C576B69613928Ff1688d152e25F0) |
| Superseded (named fields; no 欢迎词) | [`0x9c87BdCb0B0bC9F62E7994AE5a74Be39b38AcFCc`](https://testnet.monadvision.com/address/0x9c87BdCb0B0bC9F62E7994AE5a74Be39b38AcFCc) |
| Superseded (`listed` ABI; `buy()` omitted receipts) | [`0x42d980be52bc4A4EB393e665E9E3b88bbAD739dE`](https://testnet.monadvision.com/address/0x42d980be52bc4A4EB393e665E9E3b88bbAD739dE) |
| Superseded (canonical 6551; tokens 1–4 held by contract for buy()) | [`0x9e2D43c482F26D5CD49ca13F2F1E3d30CaCb2103`](https://testnet.monadvision.com/address/0x9e2D43c482F26D5CD49ca13F2F1E3d30CaCb2103) |
| Superseded (canonical 6551; tokens 1–4 on `0xe541`) | [`0x026dC4Fb3918A1c54bDbfAdAc8CF3073C54326d6`](https://testnet.monadvision.com/address/0x026dC4Fb3918A1c54bDbfAdAc8CF3073C54326d6) |
| Superseded (custom ERC-6551 registry) | [`0xd0713Ba8Eca8a918d25309ea052F641532C5673D`](https://testnet.monadvision.com/address/0xd0713Ba8Eca8a918d25309ea052F641532C5673D) |
| Superseded (hand-rolled ABI LonelyUSD) | [`0x2bc6cf69687c8bCBc5705449C667eAf3f2f166e9`](https://testnet.monadvision.com/address/0x2bc6cf69687c8bCBc5705449C667eAf3f2f166e9) |
| Superseded (hand-rolled ABI Idols100x) | [`0x996f4c6c8F9F9d47287Cd0cEB21211694edFdFca`](https://testnet.monadvision.com/address/0x996f4c6c8F9F9d47287Cd0cEB21211694edFdFca) |
| Superseded (Circle USDC + passkey sale) | [`0x02a25747fbbC7Aa5dD745B79CC152845345163A8`](https://testnet.monadvision.com/address/0x02a25747fbbC7Aa5dD745B79CC152845345163A8) |
| ERC-6551 registry (canonical Tokenbound v3) | [`0x000000006551c19487814612e58FE06813775758`](https://testnet.monadvision.com/address/0x000000006551c19487814612e58FE06813775758) |
| V3 Account Proxy (`createAccount` implementation) | [`0x55266d75D1a14E4572138116aF39863Ed6596E7F`](https://testnet.monadvision.com/address/0x55266d75D1a14E4572138116aF39863Ed6596E7F) |
| V3 Account Implementation (`initialize`) | [`0x41C8f39463A868d3A88af00cd0fe7102F30E44eC`](https://testnet.monadvision.com/address/0x41C8f39463A868d3A88af00cd0fe7102F30E44eC) |
| Ownable owner / minter | `0xa445BaC003026F5aDf51760CA850ad66750e90ad` |
| Prior-collection custodian (do not move those tokens) | `0xE541Ba52E2Eff4fEc12441C77F73352d885e183A` |

Fan **subscribe**: approve + pay LonelyUSD to the idol TBA via Passkey UserOp (`subscribe(uint256)`); gas is 代付 by the ERC-4337 paymaster. NSFW per-image: frost + lock illustration only (no lecture copy); unlock state is local in the app. `buy()` pays the current ERC-721 owner (not the TBA) and credits 累计收账.

| tokenId | display name | TBA |
| --- | --- | --- |
| 1 | Natalie100x | [`0x6123222f1aF15f7aD872D5a666580423f95CC27c`](https://testnet.monadvision.com/address/0x6123222f1aF15f7aD872D5a666580423f95CC27c) |
| 2 | moonlit_only | [`0x411Df0B85252392f87207b8165B493CD2eDbFEe6`](https://testnet.monadvision.com/address/0x411Df0B85252392f87207b8165B493CD2eDbFEe6) |
| 3 | afterhoursx | [`0x1D384A37ceB061Ab027786b68DdC437A977A92f3`](https://testnet.monadvision.com/address/0x1D384A37ceB061Ab027786b68DdC437A977A92f3) |
| 4 | waiteduh | [`0x315E1950F02271275e50bF361D4FD62b5DBBD555`](https://testnet.monadvision.com/address/0x315E1950F02271275e50bF361D4FD62b5DBBD555) |

## Tooling

[Foundry](https://book.getfoundry.sh/getting-started/installation) v1.8+ (Monad docs use the same). From this directory:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup   # need forge 1.8+

# forge-std (committed under lib/ after first install)
forge install foundry-rs/forge-std --no-commit
```

## Build / test

```bash
cd contracts
forge build
forge test -vv
```

From the repo root: `npm run contracts:test`.

## Deploy (Monad testnet)

Do **not** paste a private key into chat. Put secrets on the Cloud Agent environment (or a local untracked `.env`).

**Prepare**

1. A deployer wallet (EOA) you control.
2. Testnet MON from https://faucet.monad.xyz
3. Cloud Agent / local secrets (never commit):

| Secret | Required? | Purpose |
| --- | --- | --- |
| `PAYMASTER_SIGNER` | Yes, to broadcast | Grokbot deployer / paymaster signer (`0xa445BaC003026F5aDf51760CA850ad66750e90ad`). Foundry `vm.envUint("PAYMASTER_SIGNER")`; falls back to `GROKBOT_WEB3_WALLET`. |
| `IDOLS100X_OWNER` | No | Owner/minter; defaults to `0xa445BaC003026F5aDf51760CA850ad66750e90ad`. |
| `IDOLS100X_BASE_URI` | No | Defaults to `https://lonelyfuns.vercel.app/api/metadata/`. |

```bash
cd contracts
forge script script/DeployLonelyUSD.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
# If LonelyUSD is already live, collection only:
forge script script/DeployIdolsForLonelyUSD.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast
```

`DeployLonelyUSD` and `DeployIdolsForLonelyUSD` revert unless `block.chainid == 10143`. They `mint()` tokens 1–4 to the **deployer wallet**, write named fields from `contracts/metadata/{id}.json`, make each public on plaza, and price each at 20 LUSD. They never mint to the collection contract or transfer to `0xe541`. Do not touch tokens 1–4 on a prior collection. After a new broadcast, paste the printed LonelyUSD / Idols100x addresses and TBAs into `app/src/lib/idols100x.ts`. Do not set `IDOLS100X_ADDRESS` or `MONAD_RPC_URL` on Vercel — the running app reads the in-code constants only.

Do not put Google/X keys anywhere.
