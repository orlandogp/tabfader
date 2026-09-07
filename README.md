# TabFader

Per-tab audio control for Chromium browsers. Auto-detects tabs that are playing
sound, lets you mute any of them for free, and gives fine 0–100% volume per site
via an opt-in permission. 100% local — no telemetry, no affiliates, open source.

## Develop
- `pnpm dev` — run with hot reload
- `pnpm test` — unit + component tests
- `pnpm e2e` — Playwright end-to-end (`E2E_CHANNEL=msedge` runs it in the installed Edge; branded Chrome ignores `--load-extension` since 137)
- `pnpm build` / `pnpm zip` — production build / store zip
- `pnpm icons` — regenerate the extension icons from `assets/icon.svg`
- `pnpm store:graphics` / `pnpm store:screenshots` — Chrome Web Store assets into `docs/store/`

## Install unpacked
1. `pnpm build`
2. Open `chrome://extensions`, enable Developer Mode.
3. "Load unpacked" → select `.output/chrome-mv3`.

## Permissions
- `tabs` — to show which tabs are playing sound (their title/icon). Shown at
  install as "Read your browsing history". Nothing leaves your machine.
- Host access is requested **per site, only when you unlock fine volume there**.

Full details in [PRIVACY.md](PRIVACY.md).

## Known limitation
Widevine-DRM audio (Netflix, Disney+, Prime Video) can be muted/attenuated but
**not boosted** — this is a browser-level restriction, not a TabFader bug.

## License
MIT
