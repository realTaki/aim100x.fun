# aim100x — Bounty Demo Videos

Monad Metropolis 2026 submission · Track: Consumer Products & Payments

## KIMI

Video: _coming soon_

## Privy

Video: [privy-email-probe.mp4](./privy-email-probe.mp4)

Narration: [privy-email-probe-narration.md](./privy-email-probe-narration.md)

Live https://aim100x.fun **Continue with Privy** → email `taki@mail.grokbot.com` → confirmation code entered. After PR #7, `wallet/verify` mints an APP session (`0xc956…fd93`). After PR #11 (EIP-7702 sponsorship, Production `57c4204`), faucet `wallet/send` returns `{status:"confirmed", hashes:[0x1071…27ae]}`: sponsor `handleOps` to EntryPoint `0x4337…f108`, receipt `0x1`, LUSD **0 → 100**. Subscribe Natalie confirmed with two `handleOps` hashes; LUSD **100 → 99**. Paid chat replies (LUSD **99 → 97**). Quick-reply chips returned empty; a photo request got `wantImage: false` (model: cannot send photos). One-time codes are not recorded in the repo.

## Alchemy

Video: [alchemy-bounty-demo.mp4](./alchemy-bounty-demo.mp4) (1:27, English narration)

Narration script: [alchemy-bounty-demo-narration.md](./alchemy-bounty-demo-narration.md)

## Mera: One Passkey, Many Keys

Video: [mera-bounty-demo.mp4](./mera-bounty-demo.mp4) (1:36, English narration)

Narration script: [mera-bounty-demo-narration.md](./mera-bounty-demo-narration.md)

This is a code walkthrough of PRF, RP domain, and the sign-in path.

Live probe: [mera-passkey-probe.mp4](./mera-passkey-probe.mp4) · [mera-passkey-probe-narration.md](./mera-passkey-probe-narration.md)

Live https://aim100x.fun/login. Platform authenticator is not available (`PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()` → `false`). Chrome sheet: **Your device can't be used with this site.** A CDP virtual authenticator (`ctap2` / `ctap2_1`) **can** create a WebAuthn credential, but `getClientExtensionResults().prf` is `{ enabled: false }`. **Create Mera passkey** then shows: **Mera sign-in failed. Use a PRF-compatible passkey and the original RP domain.** No derived Mera account. A live PRF passkey ceremony is not feasible in this cloud-agent browser.

Live product: https://aim100x.fun
