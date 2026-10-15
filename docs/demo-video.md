# aim100x — Technical Demo Video

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

Narration script: [aim100x-product-demo-narration.md](./aim100x-product-demo-narration.md)

Same file as the pitch video. Live https://aim100x.fun: open site → unlock → Privy email → verify succeeds → faucet confirm. After PR #8 (testnet gas fee clamp, Production `17b375d`), the paymaster funds **0.4 MON** and `wallet/send` returns **pending** with a hash. That hash never appears on RPC (`eth_getTransactionByHash` null, nonce 0, LUSD still 0). A retry is **503** because the APP wallet lock is held. Chat, quick-reply, and image are not in this cut.

Live product: https://aim100x.fun
