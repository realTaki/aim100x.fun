# Shared public Mera RP default

Baseline main: `008a2d94eb180f022dd03d9d85f2e5839716bc03`.
Scope: Mera RP defaults and entry visibility only. README wallet-plan rewriting,
Privy JWKS, provider credentials and real passkey ceremonies are separate items.

`auth/mera-config.ts` is the browser/server shared public configuration. Default
RP is `aim100x.fun`; an absent or empty override resolves to that hostname.
Frontend signing and backend challenge/verification use the same resolver.
Mera controls render regardless of whether VITE_MERA_RP_ID exists.

Existing explicit MERA_RP_ID (server) / VITE_MERA_RP_ID (build-time client) overrides
remain supported. Set both to the same permanent valid lowercase hostname when
using an override; these are public settings, not API credentials. Do not change
RP once users have enrolled: RP remains part of their passkey and account namespace.
The salt/HKDF context, provider isolation and APP derivation code are unchanged.

Mera requires HTTPS and a host equal to the configured RP or its subdomain.
Preview domains are not automatically substituted as RPs. On a mismatched browser
origin, controls remain visible but disabled and explain the required domain.
Signing checks origin before invoking the SDK. Server challenge checks happen
before persistence; verification also checks the active RP and proof issuer.
SIWE nonce, exact request origin/domain and expiry checks remain intact.

Local evidence:
- Full npm test: script 193 passed; source 396 passed, 0 failed, 2 existing opt-in
  live probes not enabled (589 passed overall).
- Typecheck and no-secret production Vite build (`envDir:false`): passed.
- Shared resolver tests cover absence/blank/default, valid overrides, malformed
  RP input, HTTPS/subdomains, preview and suffix-spoofed origins.
- Mocked login proves default and explicit aim100x.fun create the same stable
  identity/account/APP address. Wrong origins cannot create challenge records.

Logs: `/tmp/aim-mera-tests.log`, `/tmp/aim-mera-typecheck.log`,
`/tmp/aim-mera-build.log`. CI, deployment and production button visibility are
verified against the pushed revision and reported separately.

No passkey was registered, credential/whitelist changed, real login proof used,
transaction sent or provider account merged. Public buttons and mocked signature
proofs do not establish real authenticator/PRF or authenticated database acceptance.
