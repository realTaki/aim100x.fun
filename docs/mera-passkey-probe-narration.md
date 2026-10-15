# Mera passkey probe — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%` (same recipe as the Alchemy demo). Duration ~20s.

Video: [mera-passkey-probe.mp4](./mera-passkey-probe.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | `https://aim100x.fun/login` — Continue with Privy, Sign in with Mera, Create Mera passkey |
| 0:05 | Chrome passkey sheet: **Your device can't be used with this site.** `aim100x.fun may require a newer or different kind of device` |
| 0:10 | Caption **Create Mera passkey**; virtual authenticator already created a credential with `prf.enabled: false` |
| 0:13–0:20 | App alert: **Mera sign-in failed. Use a PRF-compatible passkey and the original RP domain.** |

## Voice

| Time | Line |
| --- | --- |
| 0:00 | This cloud Chrome has no platform authenticator. |
| 0:03 | The passkey sheet says the device cannot be used with this site. |
| 0:06 | A DevTools virtual authenticator can create a passkey, but PRF stays disabled. |
| 0:11 | Create Mera passkey then fails closed: use a PRF-compatible passkey and the original RP domain. |
| 0:17 | A derived Mera account is not feasible here. |
