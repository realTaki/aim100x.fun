# Privy email probe — narration

Voice: `edge-tts` `en-US-AndrewNeural` at `+8%`. Duration 22s.

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

## Picture

| Time | On screen |
| --- | --- |
| 0:00 | Privy **Log in or sign up** — email / Google / Apple |
| 0:04 | Email submitted for `taki@mail.grokbot.com` |
| 0:10 | **Enter confirmation code** — six boxes, **Resend code** |
| 0:14–0:22 | After the code is entered: **Privy sign-in failed. Check configuration or sign in again.** |

Privy `onComplete` fired (email login accepted). `POST /api/auth/wallet/challenge` with `{ provider: "privy" }` returned **503** `{ "error": "Operation unavailable. Check configuration or transaction status before retrying." }`. Faucet / subscribe / chat did not start. The one-time code is not shown in this write-up.

## Voice

| Time | Line |
| --- | --- |
| 0:00 | Continue with Privy. |
| 0:01 | Enter Taki's email, then the confirmation code. |
| 0:04 | Privy accepts the email login. |
| 0:06 | The APP wallet challenge then returns 503: operation unavailable. |
| 0:11 | Faucet, subscribe, chat, and image cannot start until that exchange succeeds. |
