# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~26s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun — lock screen |
| 0:08 | **Set a 6-digit PIN** after Privy `wallet/verify` succeeds |
| 0:11 | Profile `/me` — APP wallet `0xc956…fd93`, **+100 LUSD** faucet |
| 0:15 | Natalie100x — **Subscribe 1 LUSD** confirm accepted |
| 0:18–0:26 | **Pay failed** — Production `wallet/send` **503** because `ALCHEMY_MONAD_TESTNET_RPC_URL` is missing on the server |

Login works after PR #7. Faucet and subscribe confirms ran; chain send cannot. Not reached: chat, quick-reply chip, image unlock. One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet, unlock, and log in with Privy email. |
| 0:06 | The confirmation code is entered. |
| 0:08 | Verify now succeeds, and the APP wallet lands. |
| 0:11 | On Profile, we claim the faucet, plus one hundred LUSD. |
| 0:15 | Then we open Natalie and confirm subscribe. |
| 0:17 | Chat, a quick-reply chip, and image cannot finish: Production is missing the Alchemy Monad RPC URL, so wallet send returns 503. |
