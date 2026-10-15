# aim100x — Technical Demo Video

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

Narration script: [aim100x-product-demo-narration.md](./aim100x-product-demo-narration.md)

Same file as the pitch video. Live https://aim100x.fun: open site → unlock → Privy email → `wallet/challenge` **200** → `wallet/verify` succeeds (PR #7 JWKS fallback, Production `1c7321b`) → APP wallet session → faucet confirm (+100 LUSD) → subscribe confirm (Natalie100x). Chat, quick-reply, and image are not in this cut: Production `POST /api/auth/wallet/send` returns **503** because `ALCHEMY_MONAD_TESTNET_RPC_URL` is not set on the server.

Live product: https://aim100x.fun
