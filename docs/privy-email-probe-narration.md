# Privy email probe — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration ~17s.

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | **Continue with Privy** |
| 0:04 | **Enter confirmation code** — six empty boxes (digits not recorded) |
| 0:09 | **Set a 6-digit PIN** after `wallet/verify` succeeds (PR #7 JWKS fallback on Production `1c7321b`) |
| 0:14–0:17 | Plaza — APP wallet session live (`Natalie100x`, `moonlit_only`, `afterhoursx`, `waiteduh`) |

Privy passwordless authenticate succeeded (`onComplete`). `POST /api/auth/wallet/challenge` `{ provider: "privy" }` returned **200**. `POST /api/auth/wallet/verify` now succeeds and mints an APP session (`get-session` **200**, provider `privy`, wallet `0xc956…fd93`). One-time codes are not shown in this write-up.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Continue with Privy. |
| 0:01 | Enter Taki's email, then the confirmation code. |
| 0:04 | Privy accepts the email login. |
| 0:06 | The APP wallet challenge returns 200. |
| 0:08 | After the JWKS verify fallback, verify succeeds, and a session is minted. |
| 0:14 | Set a PIN, then the plaza opens with the APP wallet. |
