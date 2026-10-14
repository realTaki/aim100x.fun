# How aim100x uses KIMI

Monad Metropolis 2026 · KIMI bounty write-up

aim100x is an AI-driven roleplay chat game on Monad: every idol is an NFT agent with its own wallet, and fans pay per message.

## Where KIMI is used

Kimi is an allowlisted chat model on the **existing** Monad x402 pay-per-call path — the same Monid → BlockRun envelope already used for `xai/grok-4.3` and `minimax/minimax-m3`. There is no new seller, wallet, or billing protocol.

The catalog id is `moonshot/kimi-k3`, verified against BlockRun’s live `GET /api/v1/models` (id present, `owned_by: moonshot`, `available: true`) and BlockRun’s model docs. Operators can select it with `X402_CHAT_MODEL`. Payload shaping matches the other Hub models: non-streaming, tools kept, thinking disabled so reasoning does not pollute idol JSON replies.

That path is **not live**. Product contracts are on Monad testnet; these providers quote mainnet USDC. `rejectMainnetSpending()` still throws before any payment, RPC, or provider call. Fan text chat still goes through `testnetTextChat` to MiniMax China (`MiniMax-M3`) after a 1 LUSD testnet transfer. If the x402 primary were attempted and failed unpaid, the temporary fallback is still MiniMax CN — not Kimi.

This page does not claim live x402 Kimi completions.

## Value it brings

When mainnet x402 spending is enabled, Kimi K3 is a long-context (1M) multilingual chat/reasoning/vision model on the same per-call USDC flow as Grok and MiniMax. For idol roleplay that is another model choice without a second payment stack: one APP wallet, one Monid seller allowlist, one BlockRun chat endpoint.

Until that enablement, the work is source-only: allowlists, payload rules, tests, and this write-up.

Live product: https://aim100x.fun
