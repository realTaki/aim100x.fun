# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~43s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun |
| 0:04 | `/login` — **Continue with Privy** (session already valid; no OTP) |
| 0:05 | Profile `/me` — **95 LUSD** after EIP-7702 faucet (cooldown on +100) |
| 0:09 | Plaza → Natalie100x (already a fan; **already subscribed**) |
| 0:16 | Chat `/chat/1` — tap `.lf-draft-chip` **头发还是湿的吗** |
| 0:22 | Type **发一张自拍**. Paid **Unlock photo / 1 LUSD** card lands |
| 0:29–0:43 | Tap unlock. Sponsor `handleOps` confirms. The photo opens |

Live Production HTML `/assets/index-Ddl7Bp4q.js` after `ba8aa28` (#18; server-side settle, same client hash as #13). Session still Privy; no new OTP. Faucet already on-chain (`0x1071…27ae`); subscribe already a fan. Chip + selfie + unlock deducted 3 LUSD (95 → 92). Photo `imageId` `3e1440…` unlocked via `POST /api/auth/wallet/send` `{status:"confirmed", hashes:[0xf422…2fc1]}`: sponsor `0xa445…0ad` → EntryPoint `0x4337…f108`, input `0x765e827f` (`handleOps`), receipt `0x1`, block `0x44177b4`. Image bytes loaded from `/api/media/3e1440…?access=`. One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet. Unlock, then log in with Privy email. |
| 0:06 | Verify succeeds. The APP wallet delegates with EIP-7702. |
| 0:11 | The platform sponsor submits handleOps and pays gas, so this wallet never needs MON. |
| 0:16 | The faucet already landed. Ninety-five Lonely USD sits on the profile. |
| 0:21 | Natalie is already subscribed. We open her chat. |
| 0:24 | MiniMax returns dashed quick-chat bubbles. |
| 0:27 | We tap one bubble. One Lonely USD sends. She replies. |
| 0:31 | Then we ask for a selfie. |
| 0:33 | Natalie answers in character, and a paid unlock card lands. |
| 0:36 | We tap unlock. The sponsor handleOps confirms, one Lonely USD is paid, and the photo actually opens. |
