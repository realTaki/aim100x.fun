# aim100x — Bounty Demo Videos

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

## KIMI

Video: _coming soon_

## Privy

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

Narration: [privy-email-probe-narration.md](./privy-email-probe-narration.md)

Live https://aim100x.fun **Continue with Privy** → email `taki@mail.grokbot.com` → confirmation code entered. Privy passwordless authenticate and `onComplete` succeeded. `POST /api/auth/wallet/challenge` `{ provider: "privy" }` now returns **200**. `POST /api/auth/wallet/verify` returns **401** `Login proof invalid, expired, replayed, or account unavailable` (generic inner catch; not a missing challenge cookie / not the 503 store-init path). UI: **Privy sign-in failed. Check configuration or sign in again.** Faucet / subscribe / chat / quick-reply / image did not start. One-time codes are not recorded in the repo.

## Alchemy

Video: _coming soon_

## Mera: One Passkey, Many Keys

Video: [mera-passkey-probe.mp4](./mera-passkey-probe.mp4)

Narration: [mera-passkey-probe-narration.md](./mera-passkey-probe-narration.md)

Live https://aim100x.fun/login. Platform authenticator is not available (`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` → `false`). Chrome sheet: **Your device can't be used with this site.** A CDP virtual authenticator (`ctap2` / `ctap2_1`) **can** create a WebAuthn credential, but `getClientExtensionResults().prf` is `{ enabled: false }`. **Create Mera passkey** then shows: **Mera sign-in failed. Use a PRF-compatible passkey and the original RP domain.** No derived Mera account. A bounty demo of Mera key derivation is not feasible in this cloud-agent browser.

Live product: https://aim100x.fun
