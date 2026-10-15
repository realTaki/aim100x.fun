# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~39s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun — Privy login head |
| 0:04 | Profile `/me` — **97 LUSD** after EIP-7702 faucet (cooldown on +100) |
| 0:08 | Plaza → Natalie100x (already a fan; **Message**) |
| 0:12 | Chat `/chat/1` — tap `.lf-draft-chip` **你也还没睡呢** |
| 0:20 | Reply plus new chips, including **刚洗完澡？发张照片看看** |
| 0:23–0:39 | Tap the photo chip. Paid **Unlock photo / 1 LUSD** card lands |

Live Production HTML `/assets/index-Ddl7Bp4q.js` after `d0877dc` (#13) and `41ea8f0` (#12). Session still Privy; no new OTP. Faucet was already on-chain (`0x1071…27ae`); subscribe already a fan. Chip send deducted 1 LUSD (97 → 96). Photo-chip send attached `imageMessage` (`imageId` `3e1440…`, `imagePaymentAmount` `1000000`). Unlock `POST /api/auth/wallet/send` `{status:"failed", hashes:[]}` twice — the locked card is in the cut; the image bytes did not open. One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet. Unlock, then log in with Privy email. |
| 0:06 | Verify succeeds. The APP wallet delegates with EIP-7702. |
| 0:11 | The platform sponsor submits handleOps and pays gas, so this wallet never needs MON. |
| 0:16 | The faucet already landed. Ninety-seven Lonely USD sits on the profile. |
| 0:21 | Natalie is subscribed. We open her chat. |
| 0:24 | MiniMax returns dashed quick-chat bubbles. |
| 0:27 | We tap the first bubble. One Lonely USD sends. She replies. |
| 0:31 | A photo ask appears. We tap send a photo. |
| 0:34 | Natalie answers in character, and a paid unlock card lands for one Lonely USD. |
