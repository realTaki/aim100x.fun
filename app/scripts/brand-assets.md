# Brand asset maintenance scripts

Run these scripts from the `app` directory. This repository retains the shared
asset-checking tools, but does not ship the upstream `.grok/skills/og` package or
its orchestration prompts. This document is the maintained CLI contract; it does
not start an asset-generation task or authorize publishing or deployment.

## Pending marker and checks

The marker is `.grok/og-pending`, relative to the app root. Its lifetime is
10 minutes. A fresh marker suppresses the parent smoke gate's brand warnings.
At or beyond that age, missing-asset warnings return, even if the file remains.
Remove the marker when the authorized asset work finishes.

The CLI inspects current files immediately. It never waits for a pending marker
to clear and never accepts the marker as proof of completed assets. Its JSON
reports `pending` separately from `ok`; failures exit with status 1.

For a custom share card:

```sh
node scripts/brand-check.mjs
```

For a game, which also requires `type: "x:game"` and a narrow banner:

```sh
node scripts/brand-check.mjs --game
```

A plain utility intentionally retaining the placeholder may use:

```sh
node scripts/brand-check.mjs --placeholder-ok
```

`--placeholder-ok` never excuses missing game assets. `--root <dir>` selects a
workspace to inspect. Custom card metadata lives in `src/lib/og/site.json`, with
`card: "custom"`; a file alone does not satisfy the explicit identity check.
Share cards are 1200 × 630; game banners are 1200 × 264. Keep each JPEG at or below
600 KB (for example, encode with ffmpeg `-q:v 4` and verify the size). Missing or
oversized assets remain warnings; this guide is not a reason to weaken a gate.

## Atomic hand-over

Stage outside `public/`, on the same filesystem as the final target. The CLI
resolves relative paths against its own app root, not the caller's working
directory. It refuses staging inside `public/`, same-path moves and cross-device
moves. It performs a rename, never a fallback copy. A failed hand-over preserves
the existing target. Validate each staged file before handing it over.

These are the three supported asset hand-over examples (run only after creating
and validating the corresponding staged file):

```sh
node scripts/write-atomic.mjs .grok/og.jpg.tmp public/og.jpg
node scripts/write-atomic.mjs .grok/x-banner.jpg.tmp public/x-banner.jpg
node scripts/write-atomic.mjs .grok/site.json.tmp src/lib/og/site.json
```

Unit tests execute these examples only inside disposable temporary workspaces.
They do not generate or replace this project's icons or other published assets.
