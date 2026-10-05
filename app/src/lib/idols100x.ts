/**
 * On-chain idol NFT (ERC-721 + ERC-6551 TBAs) `Idols100x` on Monad Testnet.
 * `subscribe(tokenId)` 登记 membership; `pay(tokenId, amount)` records 累计收账
 * (LonelyUSD to the idol TBA). `buy(tokenId)` pays the ERC-721 owner and also
 * credits 累计收账 (proceeds are not TBA — the buyer would reclaim them).
 * Index is token id. `tokenURI(id)` is `NFT_METADATA_BASE_URI` + decimal id.
 * Named NFT fields on-chain; Vercel `/api/metadata/{id}` composes marketplace JSON.
 */
export const IDOLS100X_CHAIN_ID = 10143;

/** Monad testnet public RPC. Hardcoded — not a Vercel env var. */
export const IDOLS100X_RPC_URL = "https://testnet-rpc.monad.xyz";

export const IDOLS100X_EXPLORER = "https://testnet.monadvision.com";

export const IDOLS100X_FAUCET = "https://faucet.monad.xyz";

/** ERC-721 metadata JSON gateway (baseURI + tokenId). */
export const NFT_METADATA_BASE_URI =
  "https://aim100x.fun/api/metadata/" as const;

/** Superseded Circle Monad testnet USDC. Payments use LonelyUSD. */
export const MONAD_TESTNET_CIRCLE_USDC =
  "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const;

/** Superseded hand-rolled LonelyUSD (pre-OpenZeppelin ERC-20). */
export const LONELY_USD_ADDRESS_PRE_OZ =
  "0x2bc6cf69687c8bCBc5705449C667eAf3f2f166e9" as const;

/** LonelyUSD (LUSD, 6 decimals, OpenZeppelin ERC-20) on Monad testnet 10143. */
export const LONELY_USD_ADDRESS =
  "0x2Ae96dD73d5Cf8f431f2d6e0cf893Db4D64262E8" as const;

/** Payment token for subscribe / pay / buy (LonelyUSD). */
export const MONAD_TESTNET_USDC = LONELY_USD_ADDRESS;

export const SUBSCRIBE_USDC_ATOMIC = 1_000_000n;

export const SUBSCRIBE_USDC_AMOUNT_STRING = "1000000";

/** Owner / minter / paymaster signer (PAYMASTER_SIGNER / Grokbot EOA). */
export const IDOLS100X_MINTER =
  "0xa445BaC003026F5aDf51760CA850ad66750e90ad" as const;

/**
 * Historical NFT custodian on prior collections. Do not steal/move those tokens.
 * `mint()` sends new idols to the caller. Defaults 1–4 are minted by the deployer, then made public and priced at 20 LUSD.
 */
export const IDOLS100X_CUSTODIAN =
  "0xe541ba52e2eff4fec12441c77f73352d885e183a" as const;

/** Previous collections (superseded). Live address is `IDOLS100X_ADDRESS`. */
export const IDOLS100X_ADDRESS_PRE_OZ_ERC721 =
  "0x996f4c6c8F9F9d47287Cd0cEB21211694edFdFca" as const;

export const IDOLS100X_ADDRESS_PRE_LINKS =
  "0x4aEC35085a8733e91f7274FafE7f13bD6AD2F91d" as const;

export const IDOLS100X_ADDRESS_PRE_PAY_FOR =
  "0x2de4B670C2628b37362571605bdD2eed0DDa4d1E" as const;

export const IDOLS100X_ADDRESS_PRE_NAMED_FIELDS =
  "0x88380ed847ab53bf5e372c1d3db280977130d889" as const;

export const IDOLS100X_ADDRESS_PRE_PERMIT =
  "0xa8beae2878e086b7366567c5236daa7da70c7bd6" as const;

export const IDOLS100X_ADDRESS_PRE_PREPAID =
  "0xa981D742677733E97f2e92fD27981bbf69D93CA3" as const;

export const IDOLS100X_ADDRESS_PRE_SUBSCRIBE =
  "0xfEb7b1d252d3972D234Bb1AD0cdd7C571144Ce54" as const;

export const IDOLS100X_ADDRESS_PRE_LISTED =
  "0x528b46f75d94064A8fcB3b3306b978fC2617b86a" as const;

export const IDOLS100X_ADDRESS_SUPERSEDED =
  "0x7f051881a17835d65c4a283d04f7f8039f68dc5e" as const;

export const IDOLS100X_ADDRESS_PREVIOUS =
  "0x1c905d48136f2689469378dccb6e49c4aa6eb674" as const;

export const IDOLS100X_ADDRESS_LEGACY =
  "0xBF07a9C8196246C5C3f7Def4f93a9D97eC8CFCE4" as const;

export const IDOLS100X_ADDRESS_PRE_SALE =
  "0x582cE908b3c358c4c7eC42160Be94bBE71b72758" as const;

export const IDOLS100X_ADDRESS_PRE_LUSD =
  "0x02a25747fbbC7Aa5dD745B79CC152845345163A8" as const;

/** Previous collection (custom ERC-6551 registry, pre-canonical Tokenbound v3). */
export const IDOLS100X_ADDRESS_PRE_CANONICAL_6551 =
  "0xd0713Ba8Eca8a918d25309ea052F641532C5673D" as const;

/** Previous collection (canonical 6551; tokens 1–4 held by the contract for buy()). */
export const IDOLS100X_ADDRESS_PRE_CALLER_MINT =
  "0x9e2D43c482F26D5CD49ca13F2F1E3d30CaCb2103" as const;

/** Previous collection (canonical 6551; tokens 1–4 sent to 0xe541). */
export const IDOLS100X_ADDRESS_PRE_CONTRACT_HELD =
  "0x026dC4Fb3918A1c54bDbfAdAc8CF3073C54326d6" as const;

/** Previous collection (`listed` ABI; `buy()` did not credit 累计收账). */
export const IDOLS100X_ADDRESS_PRE_PUBLIC =
  "0x42d980be52bc4A4EB393e665E9E3b88bbAD739dE" as const;

/** Previous collection (named fields; no 欢迎词 / `welcomeOf`). */
export const IDOLS100X_ADDRESS_PRE_WELCOME =
  "0x9c87BdCb0B0bC9F62E7994AE5a74Be39b38AcFCc" as const;

/** Previous collection (欢迎词; token 1 sold with the `eve` voice). */
export const IDOLS100X_ADDRESS_PRE_VOICE =
  "0x2b05F714A573C576B69613928Ff1688d152e25F0" as const;

/** Mint default listing: 20 LUSD (6 decimals). 0 = not for sale. */
export const DEFAULT_SALE_PRICE_USDC_ATOMIC = 20_000_000n;

/**
 * Monad testnet Idols100x: named fields + 欢迎词 (`welcomeOf`) + salePriceUsdc + buy(), LonelyUSD.
 * Canonical Tokenbound ERC-6551 v3. `mint()` pays 20 LUSD to the caller (max 4 / account, supply 100).
 * `buy()` credits `_addReceipts`. 公开 is `isPublic` / `publicOf` / `setPublic`
 * (`listedOf` / `setListed` aliases). MiniMax TTS voice ids on defaults 1–4.
 * Hardcoded live collection so a code change takes effect on deploy immediately.
 * Not a Vercel env var — do not read `process.env.IDOLS100X_ADDRESS`.
 */
export const IDOLS100X_ADDRESS =
  "0xeB88B15911431c4F3903F5780AB584E7CD6022cB" as const;

/** Canonical Tokenbound ERC-6551 v3 (Monad mainnet + testnet 10143; same as Ethereum/Base). */
export const ERC6551_REGISTRY_ADDRESS =
  "0x000000006551c19487814612e58FE06813775758" as const;

/** V3 Account Proxy — registry `createAccount` implementation argument. */
export const ERC6551_ACCOUNT_PROXY =
  "0x55266d75D1a14E4572138116aF39863Ed6596E7F" as const;

/** V3 Account Implementation — AccountProxy `initialize` argument. */
export const ERC6551_ACCOUNT_IMPLEMENTATION =
  "0x41C8f39463A868d3A88af00cd0fe7102F30E44eC" as const;

export const ERC6551_ACCOUNT_GUARDIAN =
  "0x2fe5CCB0d7Ea195FEB87987D3573f9FccE2b5d57" as const;

export const ERC6551_SALT =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const IDOLS100X_NAME = "idols100x";
export const IDOLS100X_SYMBOL = "100X";

export const IDOLS100X_DEMO_TOKEN_IDS = [1, 2, 3, 4] as const;

/** Default idol website. Stored as written; `httpUrlOf` prefixes https://. */
export const IDOLS100X_DEMO_WEBSITE = "patreon.com/Shybox" as const;

/** Default idol X URL. Same for tokens 1–4. */
export const IDOLS100X_DEMO_TWITTER = "https://x.com/ShyboxNTR" as const;

/**
 * MiniMax CN system voice for defaults 1–4 (`speech-2.8-turbo` / `t2a_v2`).
 * Documented at https://platform.minimax.cn/docs/faq/system-voice-id (温暖少女).
 */
export const IDOLS100X_DEMO_VOICE = "Chinese (Mandarin)_Warm_Girl" as const;

/** Catalog fallback when RPC is down. Handles, not given-name + surname. */
export const IDOLS100X_DEMO_FIELDS: Record<
  (typeof IDOLS100X_DEMO_TOKEN_IDS)[number],
  { name: string; bio: string; welcome: string; website: string; twitter: string; voice: string }
> = {
  1: {
    name: "Natalie100x",
    bio: "up this late for me? stay.",
    welcome: "感谢你订阅我。这么晚还来，我等好久了。",
    website: IDOLS100X_DEMO_WEBSITE,
    twitter: IDOLS100X_DEMO_TWITTER,
    voice: IDOLS100X_DEMO_VOICE,
  },
  2: {
    name: "moonlit_only",
    bio: "private acc. you weren't supposed to find this.",
    welcome: "谢谢你订阅我。今晚……就我们两个。",
    website: IDOLS100X_DEMO_WEBSITE,
    twitter: IDOLS100X_DEMO_TWITTER,
    voice: IDOLS100X_DEMO_VOICE,
  },
  3: {
    name: "afterhoursx",
    bio: "spoil me first. then maybe i look at you.",
    welcome: "订阅了我？过来，让我好好看看你。",
    website: IDOLS100X_DEMO_WEBSITE,
    twitter: IDOLS100X_DEMO_TWITTER,
    voice: IDOLS100X_DEMO_VOICE,
  },
  4: {
    name: "waiteduh",
    bio: "come closer. i bite when i'm bored.",
    welcome: "终于订阅了。过来抱一下，别再让我等。",
    website: IDOLS100X_DEMO_WEBSITE,
    twitter: IDOLS100X_DEMO_TWITTER,
    voice: IDOLS100X_DEMO_VOICE,
  },
};

/** ERC-6551 token-bound accounts (subscribe pay-to). Filled after deploy. */
export const IDOLS100X_TBA: Record<number, `0x${string}`> = {
  1: "0x6123222f1aF15f7aD872D5a666580423f95CC27c",
  2: "0x411Df0B85252392f87207b8165B493CD2eDbFEe6",
  3: "0x1D384A37ceB061Ab027786b68DdC437A977A92f3",
  4: "0x315E1950F02271275e50bF361D4FD62b5DBBD555",
};

export function subscribePayTo(tokenId: number): `0x${string}` | null {
  return IDOLS100X_TBA[tokenId] ?? null;
}

export const IDOLS100X_ABI = [
  {
    type: "function",
    name: "tokenBoundAccount",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const IDOLS100X_FAN_ABI = [
  {
    type: "function",
    name: "subscribe",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fanSubscribed",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "fan", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "subscribedIdsOf",
    stateMutability: "view",
    inputs: [{ name: "fan", type: "address" }],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "subscriberCountOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "receiptsUsdcOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const IDOLS100X_IDOL_ABI = [
  {
    type: "function",
    name: "agentOf",
    stateMutability: "view",
    inputs: [{ name: "ownerAddress", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "role", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "setAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "role", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeAgent",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "nextTokenId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "idolOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "bio", type: "string" },
          { name: "personality", type: "string" },
          { name: "look", type: "string" },
          { name: "voice", type: "string" },
          { name: "website", type: "string" },
          { name: "twitter", type: "string" },
          { name: "scenes", type: "string" },
          { name: "subscribePriceUsdc", type: "uint256" },
          { name: "imageUnlockPriceUsdc", type: "uint256" },
          { name: "isPublic", type: "bool" },
          { name: "subscriberCount", type: "uint256" },
          { name: "receiptsUsdc", type: "uint256" },
          { name: "salePriceUsdc", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "welcomeOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "setWelcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "welcome", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setIdolContent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "bio", type: "string" },
          { name: "personality", type: "string" },
          { name: "look", type: "string" },
          { name: "voice", type: "string" },
          { name: "website", type: "string" },
          { name: "twitter", type: "string" },
          { name: "scenes", type: "string" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setIdolPricing",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "subscribePriceUsdc", type: "uint256" },
          { name: "imageUnlockPriceUsdc", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "publicOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setPublic",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "isPublic", type: "bool" },
    ],
    outputs: [],
  },
  // Aliases for `publicOf` / `setPublic` (plaza/service 公开, not the 20 LUSD sale).
  {
    type: "function",
    name: "listedOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setListed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "isPublic", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "salePriceUsdcOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "setSalePrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintsOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
] as const;
