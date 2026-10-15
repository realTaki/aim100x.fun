# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~22s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun |
| 0:06 | **Set a 6-digit PIN** after Privy `wallet/verify` succeeds |
| 0:09 | Profile `/me` — APP wallet, **0.00 LonelyUSD**, faucet **+100 LUSD** confirm |
| 0:14 | Natalie100x — **Subscribe 1 LUSD** confirm |
| 0:17–0:22 | **0 LUSD · Monad Testnet** — `wallet/send` `{status:"failed", hashes:[]}` before a hash. APP wallet MON balance is 0 |

Login and RPC reads work after PR #7 plus `ALCHEMY_MONAD_TESTNET_RPC_URL`. Faucet `eth_call` from the APP wallet returns success; Production still does not sponsor gas, so send never lands. Not reached: chat, quick-reply chip, image unlock. One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet, unlock, and log in with Privy email. |
| 0:06 | Verify succeeds, and the APP wallet lands at zero LUSD. |
| 0:10 | We confirm the faucet, then confirm subscribe to Natalie. |
| 0:13 | Chat and image cannot start: wallet send fails before a hash. |
| 0:17 | The APP wallet has zero MON, so Production never sponsors the claim. |
