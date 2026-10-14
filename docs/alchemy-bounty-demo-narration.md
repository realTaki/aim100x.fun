# Alchemy bounty demo — narration

Voice: English, ~150 wpm. Total runtime **1:27**. Do not show secrets or real keys.

Timed to `docs/alchemy-bounty-demo.mp4`. Voice-over is muxed from Microsoft Edge neural TTS (`en-US-AndrewNeural`, rate +8%) via the free `edge-tts` CLI — no paid API key.

| Time | On-screen | Narration |
| --- | --- | --- |
| 0:00–0:08 | Title card | aim100x uses Alchemy as the only Monad testnet RPC. The API key never leaves the server. |
| 0:08–0:26 | `app/src/lib/monad-rpc.server.ts` — `alchemyRpcUrl` | The server helper reads ALCHEMY_MONAD_TESTNET_RPC_URL. It accepts only HTTPS on monad-testnet.g.alchemy.com. Invalid hosts are rejected. There is no public RPC fallback. |
| 0:26–0:40 | `app/src/lib/monad-rpc.server.ts` — chain check | Before every request we call eth_chainId and require Monad testnet, chain 10143. Mainnet 143 is disabled. |
| 0:40–0:52 | `app/src/lib/monad-rpc.ts` | The browser never talks to Alchemy. Reads go to same-origin /api/rpc, and the server forwards them. |
| 0:52–1:06 | `app/.env.example` | Configure ALCHEMY_MONAD_TESTNET_RPC_URL on the server only. Never prefix it with VITE_. This example is empty — no secrets. |
| 1:06–1:22 | `docs/alchemy-rpc-acceptance.md` routing table | Browser reads go through the proxy. Server reads and APP-wallet broadcasts use Alchemy. The bundler stays on Pimlico. User wallets keep their own provider. |
| 1:22–1:27 | End card | That's the Alchemy boundary for aim100x. |

Spoken duration of the seven clips is 59.98s. Each scene holds extra silent pad so the code is readable. The muxed soundtrack is 87.0s.
