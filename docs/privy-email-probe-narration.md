# Privy email probe — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration 22s.

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Privy **Log in or sign up** — email / Google / Apple |
| 0:04 | Email submitted for `taki@mail.grokbot.com` |
| 0:10 | **Enter confirmation code** — six boxes, **Resend code** |
| 0:14–0:22 | After the code is entered: **Privy sign-in failed. Check configuration or sign in again.** Caption: **Privy email accepted — APP wallet/verify returned 401** |

Privy passwordless authenticate succeeded (`onComplete`). `POST /api/auth/wallet/challenge` `{ provider: "privy" }` returned **200**. `POST /api/auth/wallet/verify` returned **401** `Login proof invalid, expired, replayed, or account unavailable` (inner catch in `wallet-auth-http.server.ts`, not a missing challenge cookie). Faucet / subscribe / chat did not start. One-time codes are not shown in this write-up.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Continue with Privy. |
| 0:01 | Enter Taki's email, then the confirmation code. |
| 0:04 | Privy accepts the email login. The APP wallet challenge now returns 200. |
| 0:09 | Verify then returns 401: login proof invalid, or account unavailable. |
| 0:14 | Faucet, subscribe, chat, and image cannot start until that exchange succeeds. |
