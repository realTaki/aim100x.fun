# aim100x — Technical Demo Video

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

Narration script: [aim100x-product-demo-narration.md](./aim100x-product-demo-narration.md)

Same file as the pitch video. Live https://aim100x.fun: open site → unlock → Privy email → `wallet/verify` succeeds → APP wallet at **0 LUSD** (RPC reads work) → faucet confirm → subscribe confirm. Chat, quick-reply, and image are not in this cut: `POST /api/auth/wallet/send` returns `{status:"failed", hashes:[]}` in ~300ms. The APP wallet has **0 MON**; faucet `eth_call` succeeds. Production gas sponsorship does not fund the claim.

Live product: https://aim100x.fun
