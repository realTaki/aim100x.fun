# On-chain idol fields (no JSON blob, no slug)

Each minted token stores **named NFT fields**. Vercel `GET /api/metadata/{tokenId}` reads those fields and composes ERC-721 marketplace JSON. Images are not on-chain.

## Named fields

| Field | Type | Role |
| --- | --- | --- |
| `name` | string | Display name (mutable) |
| `bio` | string | Profile bio |
| `personality` | string | 人设 |
| `look` | string | 外观 |
| `voice` | string | TTS voice id |
| `website` | string | Optional site URL (empty allowed) |
| `twitter` | string | Optional Twitter/X URL (empty allowed) |
| `welcome` | string | 欢迎词 (`welcomeOf` / `setWelcome`). Separate from scene `opening`. |
| `scenes` | string | 场景 — JSON array of scene objects |
| `subscribePriceUsdc` | uint256 | Fan subscribe price, USDC 6-decimal atomic |
| `imageUnlockPriceUsdc` | uint256 | Per-image unlock price, USDC 6-decimal atomic |
| `isPublic` | bool | Plaza / service visibility (公开) |

Seed files `1.json`–`4.json` plus `1.scenes.json`–`4.scenes.json` are for deploy only.

## Media buckets (off-chain)

**Bucket key = `{tokenId}/{sceneId}`**. Profile/plaza art uses scene id `profile`. Media URLs are `/api/media/{mediaId}` (full) or `?size=thumb` (same row thumbnail). Slot matching uses `Type` (`face` / `banner` / `cover`). Crop-on-upload: avatar 1:1 1408, banner 16:9 1792×1008, cover 2:3 1152×1728.
