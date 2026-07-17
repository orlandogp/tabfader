# TabTune

Trust-first per-tab audio control extension (Manifest V3, WXT + Preact). Auto-detects
audible tabs, mutes any tab for free, and offers fine 0–100% volume per site via an
opt-in permission. **100% local — no backend, no telemetry, no accounts.**

Design spec: `docs/superpowers/specs/2026-07-17-tabtune-per-tab-audio-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-17-tabtune-per-tab-audio.md`

## Language

**No internationalization. All product UI copy is English by default.** Do not add
i18n scaffolding, locale files, or non-English user-facing strings.

## Commit Convention

Format: `<type>(<scope>): <description>`

### Types

| Type       | When                                |
| ---------- | ----------------------------------- |
| `feat`     | New functionality                   |
| `fix`      | Bug fix                             |
| `refactor` | Restructure without behavior change |
| `style`    | UI/CSS/layout without logic         |
| `perf`     | Performance improvement             |
| `chore`    | Config, deps, tooling, hooks        |
| `docs`     | Documentation                       |

### Scopes

| Scope         | Covers                                                    |
| ------------- | -------------------------------------------------------- |
| `core`        | Config, types, utils, storage, messages (`lib/*`)        |
| `background`  | Service worker, message router, keyboard commands        |
| `content`     | Content script (volume applier)                          |
| `popup`       | Popup panel, Preact components, styles                   |
| `tabs`        | Audible-tab detection and mute service                   |
| `permissions` | Per-site permission opt-in flow                          |
| `e2e`         | End-to-end suite                                          |

### Rules

- Description in **imperative**, **lowercase**: "add", not "Added" or "Adding"
- Max **60 characters** on the first line
- No period at the end
- Optional body only if the "why" is not obvious

## Working agreement

- **Wait for explicit commit approval.** Don't infer it from "yes that works" / "se ve
  bien" — require an unambiguous "commit" / "adelante" / "ya pushea".
- **TDD.** Failing test first, minimal implementation, green, then commit.

## Testing ecosystem (partial adoption of tuno-testing)

- **Layers used:** unit (vitest, jsdom + `wxt/testing` fakeBrowser) · component (vitest
  **browser mode**, `*.browser.test.tsx`, real Chromium = tuno Layer 2) · E2E (Playwright,
  extension loaded via `--load-extension`). We do NOT use tuno's Next.js E2E template
  (no server/backend here).
- **Before declaring UI work done:** `pnpm test` (both projects green); for flows with a
  spec, `pnpm e2e`.
- **Every red test is classified into exactly one bucket — never silenced:**
  - *Regression* → fix the product code.
  - *Intentional* → update the spec in the SAME change as the feature.
  - *Fragile* → fix the test (semantic selectors, stabilization).
- Specs land in the same change as the feature they cover, not "later".

## Code Comments

| Prefix     | Use                                       |
| ---------- | ----------------------------------------- |
| `// TODO:` | Concrete pending item with context        |
| `// HACK:` | Temporary solution that needs improvement |
| `// NOTE:` | Explains something non-obvious            |

Rule: if code needs a comment to be understood, first try renaming. Only comment the
**why**, never the **what**.
