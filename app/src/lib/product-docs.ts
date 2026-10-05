/** Agent-facing product Markdown served at GET /docs. Not consumer UI. */

export const PRODUCT_DOCS = `# LonelyFuns

Audience: other agents (Codex, Claude, Cursor). Humans use the app; this page is how you understand it.

Live product: https://lonelyfuns.vercel.app

In-app chrome is often Chinese. Use the English names below; the Chinese in parentheses is the label you will see in the UI or on-chain.

## What it is

LonelyFuns is a phone-shaped app of **AI idols**. Each idol is a persistent persona with a public profile, paid 1:1 chat (text, voice notes, photos), and a broker who owns it.

- Fans discover idols, subscribe with **LUSD**, then open **DM** (私信, the 1:1 chat).
- **Brokers** (经纪人) own the idol **ERC-721 NFT**, edit persona and scenes, take subscribe/unlock revenue, and may sell the NFT.
- Other agents manage a broker's idols through MCP at https://lonelyfuns.vercel.app/mcp (signed \`lf1.\` bearer). The server verifies the signature and stores nothing.

NSFW photos are paywalled. Chat, subscribe, and unlock run on **Monad testnet**.

## On-chain concepts (labels, not a setup guide)

Name these standards when matching LonelyFuns to other crypto products. There is no contract-address list here.

| Label | In this product |
| --- | --- |
| **ERC-4337** account abstraction | Every user is a **Passkey smart account** (WebAuthn / Face ID / device credential). No injected wallet, seed phrase, WalletConnect, SIWE, Google, or X login. App transactions are ERC-4337 v0.6 UserOperations. |
| **Paymaster-sponsored gas** | The project Paymaster pays MON gas. Fans and brokers do not need native MON for subscribe, unlock, mint, save, or MCP writes. |
| **ERC-721** idol NFT | Collection **Idols100x**. One token = one idol. The **broker** (经纪人) **is the NFT owner**. Transfer/buy moves the whole idol (persona, scenes, TBA, future revenue). |
| **ERC-6551** token-bound account (TBA) | Canonical Tokenbound TBA bound to that ERC-721. Subscribe LUSD and per-image unlock LUSD go to the **idol TBA**. The broker later withdraws TBA LUSD to their Passkey wallet. **Not ERC-6553.** |
| **LonelyUSD (LUSD)** | Testnet ERC-20, 6 decimals. The only payment asset. Faucet, subscribe, unlock, mint, and NFT sale all use LUSD. Not Circle USDC. |
| **Agent Account** | A second ERC-4337 PasskeyAccount from a **software P-256 key** (not the broker's browser Passkey). Authorized once via \`setAgent\`. MCP signs as this account. |

\`buy()\` pays the **current ERC-721 owner**, not the TBA (otherwise the buyer would reclaim the sale). **Lifetime receipts** (累计收账) still count that sale. Plaza **public** (公开) is visibility, not the sale listing.

## Fan usage

App tabs: **Plaza** (广场) \`/\` · **Subscribed** (已订阅) \`/subscribed\` · **Creator Center** (创作者中心) \`/me/manager\` · **Profile** (个人主页) \`/me\`.

1. Open https://lonelyfuns.vercel.app → **Login** (\`/login\`) with a Passkey. First time: **+** create (a display name), then Face ID / device prompt. Same Passkey restores the same smart account.
2. **Profile**: set **Prefer language**, username, bio, avatar. Claim **+100 LUSD** from the faucet (24h cooldown) or show the deposit QR (Monad Testnet — LUSD only).
3. **Plaza**: public idols (\`isPublic\`). Search, sort by subscribers or lifetime receipts (累计收账). Open a card → profile \`/idol/{tokenId}\`.
4. **Subscribe** (订阅; default **1 LUSD**, broker can change). Pays the idol TBA; you become a fan. DM stays locked until subscribed.
5. **DM** \`/chat/{tokenId}\`: text or hold-to-talk voice (STT). The idol replies in short 1:1 lines; it may attach a photo or a voice-note bubble (TTS). Thread lives in this browser (OPFS) per Passkey account. History \`/chat/{tokenId}/history\`: search, photos tab, restart (reseeds **欢迎词** (welcome) + opening; keeps seen photos).
6. **NSFW paywall**: images tagged NSFW. On plaza/profile, subscribers see them; others pay **per-image** (单图) LUSD (default 1) per image. In chat, **each NSFW photo is paid separately** even if you already subscribed. SFW is free. Unlock is local to this account + idol.
7. If the idol is listed, **buy the NFT** (LUSD to the current owner). You become the broker.

Chat replies in the **language of the fan's latest message**. Prefer language does not lock later turns.

## Broker usage

**Creator Center** \`/me/manager\` is the broker hub (in-app copy also says **Broker Center** / 经纪人中心). Sign in first.

**Mint.** The hub can show **mint new idol** at **20 LUSD**. Max **4** mints per Passkey account, collection supply **100**. You receive the ERC-721; a TBA is created for it. New mints start private until you make them **public** (公开).

**Owned cards** open the editor \`/me/manager/{tokenId}\`:

- Name, bio (简介), website, Twitter/X
- Banner, avatar, cover album (upload / generate)
- Subscriber count and lifetime receipts (累计收账)
- **Advanced settings** (高级设置) \`/me/manager/{tokenId}/advanced\`

Advanced (save writes on-chain):

- **人设** (personality) \`personality\` — chat character
- **欢迎词** (welcome) — first assistant line after subscribe; **not** the scene opening
- **Subscribe** (订阅) / **per-image** (单图) prices in LUSD (must stay > 0)
- **Sale price** (出售价格) — LUSD listing; empty / 0 = **not for sale** (不出售)
- **Public / Hidden** (公开 / 隐藏) — plaza visibility
- TBA LUSD balance + **Withdraw to my wallet** (提现到我的钱包)
- **Look** — appearance text for new photos
- **Voice settings** (声音设定) — describe a voice, **Generate preview** (生成试听), then **Save** (保存) to store the MiniMax voice id
- **Scenes** (场景) — list of cards: \`id\` / \`topic\` / \`scene\` / \`opening\` (Add / Delete: 添加 / 删除)

**+ agent** (header) → \`/me/manager/agent\`. Create an Agent Account for MCP. See below.

MCP cannot mint, buy, transfer, upload photos, chat, faucet, or call \`setAgent\`. Those stay in this Passkey session.

## Prefer language, scenes, and 欢迎词 (welcome)

These three are what actually change fan chat. Prefer them over leftover fields.

### Prefer language

Profile picker on \`/me\` (简体中文, 繁體中文, English, 日本語, 한국어, Español, Français, Deutsch, Português, Tiếng Việt, ไทย, Bahasa Indonesia, Русский, العربية, plus the browser tag if missing). Those native names are the picker labels.

Used **only** at subscribe / first thread / restart: rewrite **欢迎词** (welcome) and the current scene **opening** (and topic heading) into that language. After the fan has sent a message, the model matches **that message**, not the picker. Do not translate on-chain **人设** (personality) / Look / names into the fan locale.

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

Separate on-chain field from every scene opening. After subscribe the thread starts with two idol assistant lines, in this order:

1. **欢迎词** (welcome; skipped if empty or duplicate of opening)
2. Current scene \`opening\`

Creator-typed language is kept until Prefer language rewrites at init. Default flavor is in-character (e.g. 感谢你订阅我, “thanks for subscribing”). Empty is allowed.

## Agent MCP

**URL:** https://lonelyfuns.vercel.app/mcp  
**Auth:** \`Authorization: Bearer lf1.…\`  
**Store:** none. Verify signature, bind the Agent Account, run the tool, discard the key.

The broker copies config from Broker Center → Agent account → **Copy Codex MCP configuration**. That Markdown is a secret (signed token + software key). Share only with a trusted agent. Reset or **Remove access** invalidates it. Clearing site data loses the local key; reset to replace.

Bearer \`lf1.\` + base64url JSON \`{ v:1, x, y, sig, d? }\`: WebAuthn envelope of \`lonelyfuns.mcp.v1\` with the Agent P-256 public key. \`d\` is the private key for writes, used in request RAM only. Missing \`d\` → reads ok, writes fail closed. Also accepted: \`Bearer 0x\` + 32-byte hex key (possession). Optional \`X-LonelyFuns-Agent-Key\` if the token has no \`d\`.

Codex:

\`\`\`bash
export LONELYFUNS_MCP_TOKEN='lf1....'
codex mcp add lonelyfuns --url https://lonelyfuns.vercel.app/mcp --bearer-token-env-var LONELYFUNS_MCP_TOKEN
\`\`\`

Cursor / Claude: Streamable HTTP MCP, same URL, header \`Authorization: Bearer lf1.…\`.

Authorization follows the **NFT owner**, not a single token: every idol that owner holds now or later. Role:

- **Content** — named content + plaza public (公开)
- **Full** — Content + subscribe / unlock / sale prices

| Tool | Role | Does |
| --- | --- | --- |
| \`get_agent_status\` | any | Agent Account, whether it is deployed, managed idols |
| \`list_managed_idols\` | any | Idols this agent may manage |
| \`get_idol\` | any | On-chain fields, prices, owner, role |
| \`update_idol_content\` | Content or Full | Patch \`name\`, \`bio\`, \`personality\`, \`look\`, \`voice\`, \`website\`, \`twitter\`, \`welcome\` (**欢迎词**), \`scenes\` (JSON array string). Unspecified fields stay. |
| \`set_idol_public\` | Content or Full | Plaza \`isPublic\` |
| \`update_idol_pricing\` | Full | \`subscribePriceUsdc\`, \`imageUnlockPriceUsdc\` as human LUSD strings (e.g. \`"1"\`, \`"1.5"\`); must stay > 0 |
| \`set_idol_sale_price\` | Full | Human LUSD string; \`"0"\` = not for sale (不出售) |

Writes are Paymaster-sponsored UserOps from the Agent Account.

**Cannot via MCP:** mint / buy / transfer NFTs; \`setAgent\` / \`removeAgent\`; photo album, covers, generated images; chat; faucet; withdrawing TBA LUSD (broker Passkey in-app).

## Paths

| Path | Who |
| --- | --- |
| \`/\` | Plaza (广场) |
| \`/idol/{tokenId}\` | Public idol profile, subscribe, unlock, buy |
| \`/chat/{tokenId}\` | Fan DM (私信; must be subscribed) |
| \`/chat/{tokenId}/history\` | Thread history / photos / restart |
| \`/subscribed\` | Fan's subscribed idols (已订阅) |
| \`/login\` | Passkey |
| \`/me\` | Prefer language, profile, LUSD faucet |
| \`/me/manager\` | Broker hub (经纪人), mint |
| \`/me/manager/{tokenId}\` | Idol editor |
| \`/me/manager/{tokenId}/advanced\` | 人设 (personality), 欢迎词 (welcome), prices, public (公开), Look, voice, scenes (场景) |
| \`/me/manager/agent\` | Authorize MCP Agent Account |
| \`/mcp\` | Agent MCP (this is not a page) |
| \`/docs\` | This Markdown |

Default idol voices are MiniMax Chinese (Mandarin) system voices until the broker generates new **voice settings** (声音设定).
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
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
<title>LonelyFuns docs</title>
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
