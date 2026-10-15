# Mera bounty demo — narration

Voice: English, ~150 wpm. Total runtime **1:36**. Do not show secrets or real keys. This is a code walkthrough; cloud Chrome cannot complete a live PRF passkey ceremony.

Timed to `docs/mera-bounty-demo.mp4`. Voice-over is muxed from Microsoft Edge neural TTS (`en-US-AndrewNeural`, rate +8%) via the free `edge-tts` CLI — no paid API key.

| Time | On-screen | Narration |
| --- | --- | --- |
| 0:00–0:08 | Title card | aim100x uses Mera for passkey login. PRF stays on the device. The server never sees the key. |
| 0:08–0:26 | `app/src/lib/auth/mera-client.ts` — `signInWithMera` | Sign-in uses the official Mera SDK. Create or get a passkey with PRF, derive a secp256k1 session, sign a one-time challenge, then end the session and zero the buffers. |
| 0:26–0:40 | `app/src/lib/auth/mera-config.ts` — RP + origin | The relying party defaults to aim100x.fun. Sign-in requires HTTPS on that host or a subdomain. Preview URLs are rejected. |
| 0:40–0:52 | `app/src/lib/auth/mera-key.ts` — HKDF | Frozen HKDF context turns the PRF bytes into a login key. They never leave the device, and they are never the APP wallet key. |
| 0:52–1:04 | `app/src/lib/auth/wallet-sign-in.tsx` | The login card shows Create and Sign in with Mera. On a mismatched origin the buttons stay visible but disabled. |
| 1:04–1:18 | `app/src/lib/auth/wallet-auth-http.server.ts` | The server checks the same RP and origin before challenge and verify. It never receives PRF output. |
| 1:18–1:30 | Why cloud Chrome cannot demo | Cloud Chrome has no platform authenticator PRF, and a virtual authenticator returns none. A live passkey demo is not possible here. |
| 1:30–1:36 | End card | That's the Mera boundary for aim100x. |

Spoken duration of the eight clips is 59.52s. Each scene holds extra silent pad so the code is readable. The muxed soundtrack is 96.0s.
