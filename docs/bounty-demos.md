# aim100x — Bounty Demo Videos

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

## KIMI

Video: _coming soon_

## Privy

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

Narration: [privy-email-probe-narration.md](./privy-email-probe-narration.md)

Live https://aim100x.fun **Continue with Privy** → email `taki@mail.grokbot.com` → confirmation code entered. Privy passwordless authenticate and `onComplete` succeeded. `POST /api/auth/wallet/challenge` `{ provider: "privy" }` returns **200**. After PR #7 (JWKS verify fallback, Production `1c7321b`), `POST /api/auth/wallet/verify` succeeds and mints an APP session (`get-session` **200**, provider `privy`, APP wallet `0xc956…fd93`). Plaza opens after PIN setup. RPC reads work (`/me` shows **0 LUSD**). After PR #8 (testnet gas fee clamp, Production `17b375d` READY), `POST /api/auth/wallet/send` faucet returns `{status:"pending", hashes:[0xe423…b64d]}` and the APP wallet receives **0.4 MON** from the paymaster. `eth_getTransactionByHash` / receipt stay empty; nonce stays 0; LUSD stays 0. A same-id retry stays pending; a new requestId returns **503** (account lock held). Chat / quick-reply / image not reached. One-time codes are not recorded in the repo.

## Alchemy

Video: _coming soon_

## Mera: One Passkey, Many Keys

Video: [mera-passkey-probe.mp4](./mera-passkey-probe.mp4)

Narration: [mera-passkey-probe-narration.md](./mera-passkey-probe-narration.md)

Live https://aim100x.fun/login. Platform authenticator is not available (`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` → `false`). Chrome sheet: **Your device can't be used with this site.** A CDP virtual authenticator (`ctap2` / `ctap2_1`) **can** create a WebAuthn credential, but `getClientExtensionResults().prf` is `{ enabled: false }`. **Create Mera passkey** then shows: **Mera sign-in failed. Use a PRF-compatible passkey and the original RP domain.** No derived Mera account. A bounty demo of Mera key derivation is not feasible in this cloud-agent browser.

Live product: https://aim100x.fun
