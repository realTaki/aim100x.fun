# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~29s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun |
| 0:03 | **Continue with Privy** on `/login` |
| 0:09 | Profile `/me` — **0 LUSD**, caption **Claim faucet +100 LUSD** (PR #8 gas clamp, Production `17b375d`) |
| 0:18 | Plaza — caption **Subscribe to Natalie100x** |
| 0:22–0:29 | Natalie100x — **Subscribe 1 LUSD**. Still not a fan. Caption: **Chat blocked — lock held, 0 LUSD** |

After PR #8, `wallet/send` faucet returns `{status:"pending", hashes:[0xe423…b64d]}` and the APP wallet receives **0.4 MON** from the paymaster. `eth_getTransactionByHash` / receipt stay empty; nonce stays 0. A second send returns **503** (account lock held). Chat, quick-reply, and image are not in this cut. One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet. Unlock, then log in with Privy email. |
| 0:06 | Verify succeeds, and the plaza opens on the APP wallet. |
| 0:09 | After the gas-fee clamp, the paymaster funds testnet gas. |
| 0:13 | We claim plus one hundred Lonely USD from the faucet. |
| 0:16 | The send returns pending with a hash, but that hash never mines. Lonely USD stays at zero. |
| 0:22 | Natalie still asks for a subscribe. |
| 0:24 | Chat, a quick-reply bubble, and the image cannot start: the APP wallet lock is held. |
