/** Agent-facing product Markdown served at GET /docs. Not consumer UI. */

export const PRODUCT_DOCS = `# aim100x.fun

Discover AI idols, chat through text and voice, or create a character with its own personality and scenes. aim100x.fun combines AI roleplay with NFT ownership on Monad: fans subscribe to idols, and creators shape their content, set prices, and receive payments.

This guide covers fan, creator, and agent workflows.

Live product: https://aim100x.fun

The app UI uses English; Chinese terms below are legacy labels. Chat language follows the browser by default; an explicit language choice is saved on the device.

## Storage and wallet boundaries

Neon stores independent account, session and operation records alongside private idol content; media lives in R2. Mainnet payments and delegation are disabled.

## Wallet design and derivation

AIM100x currently uses self-managed, server-derived **APP wallets** for continuous backend payments. The project has not adopted a paid Privy wallet setup and is temporarily using this design; it is a project choice, not a limitation of Privy or Mera. External-wallet, Privy and Mera identities each map to an independent APP account, without automatic account merging.

**Privy** embedded wallets can support automatic backend payments through authorized additional server signers and policies, including its Node x402 client. Privy also offers free core usage. In this app, embedded-wallet creation is currently off: Privy verifies identity, and the APP wallet signs business transactions.

**Mera** provides a passkey-derived secp256k1 EOA identity and can sign repeatedly within an active signing session. This app ends that client session after the login proof and clears the key buffers; it has not integrated backend delegated signing for the Mera identity. The APP wallet therefore handles ongoing payments. Its account ID binds the Mera namespace, stable RP and verified signer address; the server combines that ID with its master secret to derive the APP private key. This links the two identities, but the APP key is **not derived from the Mera private key or PRF**.

The server signs only allowed requests from an authenticated session, checking ownership, prices and replay state. APP private keys stay on the server. All supported business operations, including NFT transactions, use the APP wallet, with platform-funded gas within its allowance.

[Implementation details and official references](https://github.com/realTaki/aim100x.fun/blob/main/docs/wallet-design.md).


## What it is

Each **AI idol** has a public profile, a creator-defined persona, and private conversations with text, voice notes, and photos.

- Fans discover idols, subscribe with **LUSD**, then open **DM** (私信, the 1:1 chat).
- **Brokers** (经纪人) own the idol **ERC-721 NFT**, edit persona and scenes, take subscribe/unlock revenue, and may sell the NFT.
- Other agents manage a broker's idols through MCP at https://aim100x.fun/mcp (signed \`lf1.\` bearer). The server verifies the signed proof and keeps any supplied signing key in request memory.

A **one-time LUSD subscription** unlocks chat. Text costs **1 testnet LUSD per message**, paid by the APP wallet before direct MiniMax China text generation. Image unlocks retain their separate LUSD quote. Ambiguous operations preserve their request ID and are not automatically paid again.

## Accounts, ownership, and payments

| Label | In this product |
| --- | --- |
| **External-wallet SIWE / Privy / Mera** | Verified identities bind independent APP accounts; current wallet choices are explained above. |
| **APP wallet** | Stable server-derived EOA signs all supported business transactions on testnet; the platform funds gas. Mainnet payment and delegation are disabled. |
| **ERC-721** idol NFT | Collection **Idols100x**. One token = one idol. The **broker** (经纪人) **is the NFT owner**. Transfer/buy changes control of the idol and its TBA. Assets stay at the TBA address; private content access follows ownership. Browser chat history is not transferred. |
| **ERC-6551** token-bound account (TBA) | Subscription and image LUSD receipts stay in the idol TBA; its current owner withdraws them to their APP wallet. |
| **LonelyUSD (LUSD)** | Testnet ERC-20, 6 decimals. APP-wallet product payments and per-message simulated billing use LUSD. |
| **Agent Account** | Legacy ERC-4337 identity for MCP content authorization. Its transaction signer is disabled; chain writes require an authenticated APP wallet. |

\`buy()\` pays the **current ERC-721 owner**, not the TBA (otherwise the buyer would reclaim the sale). **Lifetime receipts** (累计收账) still count that sale. Plaza **public** (公开) is visibility, not the sale listing.

## Fan usage

App tabs: **Plaza** (广场) \`/\` · **Subscribed** (已订阅) \`/subscribed\` · **Creator Center** (创作者中心) \`/me/manager\` · **Profile** (个人主页) \`/me\`.

1. Open https://aim100x.fun → **Login** with an external wallet, Privy or Mera when configured. Each identity has a separate APP account. The device PIN is a screen lock, not account authentication.
2. **Profile**: set **Prefer language**, username, bio and avatar. Claim **+100 LUSD** into your APP wallet for testnet product operations. Platform gas is bounded by its daily allowance; no MON deposit is required.
3. **Plaza**: public idols (\`isPublic\`). Search, sort by subscribers or lifetime receipts (累计收账). Open a card → profile \`/idol/{tokenId}\`.
4. **Subscribe** (订阅; one-time payment, default **1 LUSD**, broker can change). Pays the idol TBA; you become a fan. DM stays locked until subscribed.
5. **DM** \`/chat/{tokenId}\`: text or hold-to-talk voice (STT). The idol replies in short 1:1 lines; it may attach a photo or a voice-note bubble (TTS). Thread lives in this browser (OPFS) per APP account. History \`/chat/{tokenId}/history\`: search, photos tab, restart (reseeds **欢迎词** (welcome) + opening; keeps seen photos).
6. **NSFW paywall**: images tagged NSFW. On plaza/profile, subscribers see them; others pay **per-image** (单图) LUSD (default 1) per image. In chat, **each NSFW photo is paid separately** even if you already subscribed. SFW is free. Unlock is local to this account + idol.
7. If the idol is listed, **buy the NFT** (LUSD to the current owner). You become the broker.

Chat replies in the **language of the fan's latest message**. Prefer language does not lock later turns.

## Broker usage

**Creator Center** \`/me/manager\` is the broker hub (in-app copy also says **Broker Center** / 经纪人中心). Sign in first.

**Mint.** The hub can show **mint new idol** at **20 LUSD**. Max **4** mints per APP wallet, collection supply **100**. Your APP wallet receives the ERC-721; a TBA is created for it. New mints start private until you make them **public** (公开).

**Owned cards** open the editor \`/me/manager/{tokenId}\`:

- Name, bio (简介), website, Twitter/X
- Banner, avatar, cover album (upload / generate)
- Subscriber count and lifetime receipts (累计收账)
- **Advanced settings** (高级设置) \`/me/manager/{tokenId}/advanced\`

Advanced (creative configuration saves to private Neon; prices and NFT operations remain on-chain):

- **人设** (personality) \`personality\` — chat character
- **欢迎词** (welcome) — first assistant line after subscribe; **not** the scene opening
- **Subscribe** (订阅) / **per-image** (单图) prices in LUSD (must stay > 0)
- **Sale price** (出售价格) — LUSD listing; empty / 0 = **not for sale** (不出售)
- **Public / Hidden** (公开 / 隐藏) — plaza visibility
- TBA LUSD balance + **Withdraw to my wallet** (提现到我的钱包)
- **Look** — appearance text for new photos
- **Voice settings** (声音设定) — save an existing MiniMax voice ID; leave it empty to disable voice notes. Voice design is unavailable through the current Monad Hub routes
- **Scenes** (场景) — list of cards: \`id\` / \`topic\` / \`scene\` / \`opening\` (Add / Delete: 添加 / 删除)

**+ agent** (header) → \`/me/manager/agent\`. Create an Agent Account for MCP. See below.

MCP chain writes are disabled. Mint, buy, sale/pricing, faucet and Agent authorization use the authenticated APP-wallet session. Direct NFT transfers have no current product entry point.

## Prefer language, scenes, and 欢迎词 (welcome)

Language preferences shape the opening messages; the persona and current scene guide the conversation.

### Prefer language

Profile picker on \`/me\` (简体中文, 繁體中文, English, 日本語, 한국어, Español, Français, Deutsch, Português, Tiếng Việt, ไทย, Bahasa Indonesia, Русский, العربية, plus the browser tag if missing). Those native names are the picker labels.

Used **only** at subscribe / first thread / restart: rewrite **欢迎词** (welcome) and the current scene **opening** (and topic heading) into that language. After the fan has sent a message, the model matches **that message**, not the picker. Do not translate the private **人设** (personality) / Look / names into the fan locale.

### Scenes (场景)

Each scene is four fields:

| Field | Meaning | Chat |
| --- | --- | --- |
| \`id\` | Stable key (e.g. \`late-night\`) | Picks the chapter and which photos belong to it. Not spoken. |
| \`topic\` | Chapter title | System “current scene” title; UI meta. |
| \`scene\` | Setting / mood | System stays in this setting. Also guides photo restock. |
| \`opening\` | First in-scene idol line | Seeded as an assistant bubble. **Not** 欢迎词 (welcome). |

MCP \`update_idol_content.scenes\` is a **JSON array encoded as a string**, e.g. \`[{"id":"late-night","topic":"第 01 章 · 深夜私信","scene":"深夜卧室，暧昧灯光。","opening":"嘿，这么晚还不睡？"}]\` (chapter title “Ch. 01 · Late-night DM”, setting “late-night bedroom, dim lights.”, opening “Hey, still up this late?”).

### 欢迎词 (welcome)

Separate private idol configuration from every scene opening. After subscribe the thread starts with two idol assistant lines, in this order:

1. **欢迎词** (welcome; skipped if empty or duplicate of opening)
2. Current scene \`opening\`

Creator-typed language is kept until Prefer language rewrites at init. Default flavor is in-character (e.g. 感谢你订阅我, “thanks for subscribing”). Empty is allowed.

## Agent MCP

**URL:** https://aim100x.fun/mcp
**Auth:** \`Authorization: Bearer lf1.…\`  
**Authentication:** verify the signed P-256 proof and bind the Agent Account through its factory and, when deployed, its on-chain public key. Signing keys supplied for writes stay in request memory.

The broker copies config from Broker Center → Agent account → **Copy Codex MCP configuration**. That Markdown is a secret (signed token + software key). Share only with a trusted agent. Reset or **Remove access** invalidates it. Clearing site data loses the local key; reset to replace.

Bearer \`lf1.\` + base64url JSON \`{ v:1, x, y, sig, d? }\`: WebAuthn envelope of \`lonelyfuns.mcp.v1\` with the Agent P-256 public key. \`d\` is the private key for writes, used in request RAM only. Missing \`d\` → reads ok, writes fail closed. Also accepted: \`Bearer 0x\` + 32-byte hex key (possession). Optional \`X-LonelyFuns-Agent-Key\` if the token has no \`d\`.

Codex:

\`\`\`bash
export LONELYFUNS_MCP_TOKEN='lf1....'
codex mcp add aim100x --url https://aim100x.fun/mcp --bearer-token-env-var LONELYFUNS_MCP_TOKEN
\`\`\`

Cursor / Claude: Streamable HTTP MCP, same URL, header \`Authorization: Bearer lf1.…\`.

Authorization follows the **NFT owner**, not a single token: every idol that owner holds now or later. Role:

- **Content** — named content + plaza public (公开)
- **Full** — Content + subscribe / unlock / sale prices

| Tool | Role | Does |
| --- | --- | --- |
| \`get_agent_status\` | any | Agent Account, whether it is deployed, managed idols |
| \`list_managed_idols\` | any | Idols this agent may manage |
| \`get_idol\` | any | Authorized private configuration plus on-chain prices, owner and role |
| \`update_idol_content\` | Content or Full | Patch \`name\`, \`bio\`, \`personality\`, \`look\`, \`voice\`, \`website\`, \`twitter\`, \`welcome\` (**欢迎词**), \`scenes\` (JSON array string). Unspecified fields stay. |
| \`set_idol_public\` | Content or Full | Plaza \`isPublic\` |
| \`update_idol_pricing\` | unavailable | Change prices through the authenticated APP-wallet Creator Center. |
| \`set_idol_sale_price\` | unavailable | Change sale prices through the authenticated APP-wallet Creator Center. |

Content and visibility writes save private Neon configuration after role checks. MCP pricing and sale tools are currently unavailable: no APP-account authorization has been implemented for those tools.

**Cannot via MCP:** chain transactions, mint/buy/transfer, faucet or TBA withdrawal. Supported app business operations use the APP wallet; the login wallet never signs them.

## Paths

| Path | Who |
| --- | --- |
| \`/\` | Plaza (广场) |
| \`/idol/{tokenId}\` | Public idol profile, subscribe, unlock, buy |
| \`/chat/{tokenId}\` | Fan DM (私信; must be subscribed) |
| \`/chat/{tokenId}/history\` | Thread history / photos / restart |
| \`/subscribed\` | Fan's subscribed idols (已订阅) |
| \`/login\` | External-wallet SIWE / Privy / Mera authentication |
| \`/me\` | Prefer language, profile, LUSD faucet |
| \`/me/manager\` | Broker hub (经纪人), mint |
| \`/me/manager/{tokenId}\` | Idol editor |
| \`/me/manager/{tokenId}/advanced\` | 人设 (personality), 欢迎词 (welcome), prices, public (公开), Look, voice, scenes (场景) |
| \`/me/manager/agent\` | Authorize MCP Agent Account |
| \`/mcp\` | Agent MCP (this is not a page) |
| \`/docs\` | This Markdown |

## AI services and current limits

Text uses direct MiniMax China MiniMax-M3 after a verified 1 LUSD APP-wallet payment. Existing image/voice/STT integrations are retained, but routes requiring mainnet payment are blocked; a text test does not establish those routes' readiness.

Optional platform-paid image fallback depends on configuration and never retries an uncertain payment. Mainnet USDC is not required for testnet text chat.

## Implementation status

This guide describes current code; offline tests and deployed anonymous-page checks are distinct from authenticated live acceptance.

- **Implemented:** external-wallet SIWE, Privy and Mera identity login adapters; independent server-derived APP accounts; APP-signed testnet LUSD and NFT operations; platform-funded gas within limits; direct MiniMax China text; private Neon/R2 content and authorized MCP content reads/edits.
- **Recorded verification:** offline login/operation/replay/ownership tests and production anonymous UI/icon smoke. Provider configuration, real passkey ceremonies, database initialization and funded business transactions need live acceptance.
- **Not implemented:** direct NFT transfers or general wallet transfers in the app; MCP chain-write authorization for an APP account; Privy automatic JWKS fallback. Legacy external-wallet, Passkey and Agent Account transaction writers are disabled. Mainnet RPC, x402 spending and EIP-7702 delegation remain disabled.

Subscriptions remain part of the product. Removing them in favor of message-only billing would be a product change, not a description of current behavior.
`;

const DOCS_HEADERS = {
  "Cache-Control": "public, max-age=60",
  "Access-Control-Allow-Origin": "*",
} as const;

function prefersHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (/\btext\/markdown\b/i.test(accept) || /\btext\/plain\b/i.test(accept)) {
    return false;
  }
  return /\btext\/html\b/i.test(accept);
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** Raw Markdown for agents; a \`<pre>\` wrapper when a browser asks for HTML. */
export function handleProductDocsRequest(request: Request): Response {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...DOCS_HEADERS, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (prefersHtml(request)) {
    const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>aim100x.fun docs</title>
<pre style="white-space:pre-wrap;font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:1.5rem;max-width:52rem">${escapeHtml(PRODUCT_DOCS)}</pre>
`;
    return new Response(method === "HEAD" ? null : html, {
      headers: {
        ...DOCS_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": "inline",
      },
    });
  }

  return new Response(method === "HEAD" ? null : PRODUCT_DOCS, {
    headers: {
      ...DOCS_HEADERS,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'inline; filename="docs.md"',
    },
  });
}
