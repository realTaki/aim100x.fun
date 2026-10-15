# Product / pitch demo — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~33s. Same file as the pitch video.

Video: [aim100x-product-demo.mp4](./aim100x-product-demo.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Chrome opens https://aim100x.fun |
| 0:03 | **Continue with Privy** on `/login` |
| 0:09 | Profile `/me` — **100 LUSD** after EIP-7702 faucet (Production `57c4204`) |
| 0:16 | Natalie100x — **Subscribe 1 LUSD** |
| 0:20 | Chat `/chat/1` — type **hey, still up?** |
| 0:26–0:33 | Natalie replies. No quick-reply chips; no paid photo |

Faucet `wallet/send` `{status:"confirmed", hashes:[0x1071…27ae]}` is sponsor `handleOps` to EntryPoint `0x4337…f108` (not an APP-wallet EOA transfer). Receipt `status=0x1`. APP code is EIP-7702 delegation `0xef0100…`. Subscribe confirmed with two `handleOps` hashes. Chat deducted 1 LUSD per message and returned a model reply (`wantImage: false`, `choices: []`). One-time codes are not in the repo.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Open aim100x.fun on Monad testnet. Unlock, then log in with Privy email. |
| 0:06 | Verify succeeds. The APP wallet delegates with EIP-7702. |
| 0:11 | The platform sponsor submits handleOps and pays gas, so this wallet never needs MON. |
| 0:16 | We claim plus one hundred Lonely USD. The faucet receipt is on-chain. |
| 0:21 | Subscribe to Natalie for one Lonely USD. Approve and subscribe both land. |
| 0:26 | Chat opens. We send a paid line, and Natalie replies. |
| 0:30 | Quick-reply chips and a photo did not come back from the model this time. |
