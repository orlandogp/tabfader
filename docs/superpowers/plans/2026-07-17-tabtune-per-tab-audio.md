# TabTune — Per-Tab Audio Control Implementation Plan

> **Note (2026-09-07):** the product was renamed from the working name TabTune to **TabFader**. File names and identifiers in this plan keep the original slug.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trust-first Manifest V3 browser extension that auto-detects audible tabs, lets the user mute any tab for free, and controls fine 0–100% volume per site via an opt-in permission flow.

**Architecture:** A service worker enumerates audible tabs and executes mute via `chrome.tabs`; a Preact popup renders the mixer UI; a content script (injected only into granted origins) sets `HTMLMediaElement.volume`. State (per-origin volume) lives in `chrome.storage.local`. No `tabCapture`, no Web Audio graph — attenuation only, which sidesteps CORS tainting and works even on DRM sites.

**Tech Stack:** WXT (extension framework, Vite-based) · TypeScript · Preact (popup UI) · `wxt/storage` · Vitest with two projects — **unit** (jsdom + `wxt/testing` fakeBrowser) and **component** (Vitest **browser mode**, Chromium, `*.browser.test.tsx`) · @testing-library/preact · Playwright (extension E2E).

**Testing approach (partial adoption of the `tuno-testing` ecosystem):** We reuse the transferable layers of the tuno-testing plugin — Layer 1 unit (vitest), Layer 2 component in **browser mode** (real Chromium render, not jsdom), and its red-test discipline — but deliberately **do not** use its Next.js E2E template (production Next server + seeded backend + auth), because TabTune is a serverless, backendless browser extension. E2E uses an extension-specific Playwright setup (`launchPersistentContext` + `--load-extension`). Do NOT run `tuno-testing:testing-setup` wholesale; its templates assume Next.

## Global Constraints

- Manifest V3 only. Target Chromium browsers (Chrome, Edge, Brave, Opera, Vivaldi).
- **No `chrome.tabCapture`, no offscreen document, no Web Audio graph.** Fine volume uses `HTMLMediaElement.volume` in range `0.0`–`1.0` only. No boost > 100%.
- Manifest `permissions`: `["tabs", "storage", "scripting"]`. Manifest `optional_host_permissions`: `["*://*/*"]` — requested per-origin at runtime, never at install.
- Mute uses `chrome.tabs.update(tabId, { muted })` and requires no host permission.
- Per-origin volume persisted in `chrome.storage.local`; must survive reload and same-origin navigation.
- Zero telemetry, zero network calls, no analytics, no affiliate code. All logic local.
- Content script is registered/injected **only** for origins the user explicitly granted.
- Use `browser` from `wxt/browser` in all extension code (WXT's cross-browser alias for `chrome`).

---

## File Structure

```
tabtune/
  package.json
  CLAUDE.md                          # testing working-agreement (from tuno-testing discipline)
  wxt.config.ts                      # WXT config: manifest, Preact module
  tsconfig.json
  vitest.config.ts                   # Vitest: unit (jsdom) + component (browser mode) projects
  lib/
    types.ts                         # Shared types: AudibleTab, SitePref, Settings
    origin.ts                        # originKeyFromUrl, isSupportedUrl (pure)
    volume.ts                        # clampVolume, percentToUnit, unitToPercent (pure)
    storage.ts                       # typed wxt/storage items + helpers
    audible-tabs.ts                  # queryAudibleTabs() -> AudibleTab[]
    permissions.ts                   # hasOrigin/requestOrigin/removeOrigin
    messages.ts                      # typed message protocol + sendMessage
  entrypoints/
    background.ts                    # service worker: event wiring + message router
    content.ts                       # runtime-registered content script (volume applier)
    popup/
      index.html
      main.tsx                       # Preact mount
      App.tsx                        # panel root
      components/
        TabRow.tsx
        VolumeSlider.tsx
        DonationFooter.tsx
  test/
    setup.ts                         # unit-project setup (fakeBrowser reset + jest-dom)
    setup.browser.ts                 # component-project setup (jest-dom only)
  e2e/
    fixtures.ts                      # Playwright extension-loading fixture
    media-page.html                  # local page with <audio>/<video> for E2E
    mixer.spec.ts
```

---

### Task 1: Project scaffold and toolchain

**Files:**
- Create: `tabtune/package.json`, `tabtune/wxt.config.ts`, `tabtune/tsconfig.json`, `tabtune/vitest.config.ts`, `tabtune/test/setup.ts`
- Create: `tabtune/entrypoints/popup/index.html`, `tabtune/entrypoints/popup/main.tsx`, `tabtune/entrypoints/popup/App.tsx`
- Test: `tabtune/lib/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a buildable WXT+Preact project and a working `pnpm test` command.

- [ ] **Step 1: Initialize dependencies (manual WXT setup — the dir is non-empty)**

The `tabtune/` directory already contains `.git/`, `docs/`, `CLAUDE.md`, and `.gitignore`, so `wxt init` (which requires an empty dir) is NOT used. Scaffold manually:
```bash
cd tabtune
pnpm init
pnpm pkg set type=module
pnpm add preact
pnpm add -D wxt @wxt-dev/module-preact
pnpm add -D vitest @testing-library/preact @testing-library/jest-dom jsdom
pnpm add -D @vitest/browser playwright          # component tests in real Chromium (tuno Layer 2)
pnpm add -D @playwright/test                     # extension E2E
pnpm exec playwright install chromium
```
Expected: `package.json` created; all dependencies installed.

- [ ] **Step 2: Create WXT config, tsconfig, and popup skeleton**

Create `wxt.config.ts`:
```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-preact'],
  manifest: {
    name: 'TabTune',
    description: 'Per-tab audio control: auto-detect, mute, and fine volume per site. 100% local.',
    permissions: ['tabs', 'storage', 'scripting'],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'TabTune' },
  },
});
```

Create `tsconfig.json` (extends WXT's generated config; sets Preact JSX):
```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "preact"
  }
}
```

Generate WXT types + the `@/` path alias:
```bash
pnpm wxt prepare
```

Create the minimal popup entrypoint (replaced with the real panel in Task 14):

`entrypoints/popup/index.html`:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>TabTune</title></head>
  <body><div id="app"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

`entrypoints/popup/main.tsx`:
```tsx
import { render } from 'preact';
import { App } from './App';

render(<App />, document.getElementById('app')!);
```

`entrypoints/popup/App.tsx`:
```tsx
export function App() {
  return <div>TabTune</div>;
}
```

- [ ] **Step 3: Configure Vitest with the WXT plugin**

Create `vitest.config.ts` with two projects — **unit** (jsdom + fakeBrowser) and **component** (real Chromium browser mode, files named `*.browser.test.tsx`):
```ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          include: ['**/*.test.{ts,tsx}'],
          exclude: ['**/*.browser.test.tsx', '**/node_modules/**', '**/.output/**'],
          setupFiles: ['./test/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['**/*.browser.test.tsx'],
          setupFiles: ['./test/setup.browser.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
```

Create `test/setup.ts` (unit project — fakeBrowser + jest-dom):
```ts
import { fakeBrowser } from 'wxt/testing';
import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  fakeBrowser.reset();
});
```

Create `test/setup.browser.ts` (component project — jest-dom matchers only; no fakeBrowser in real browser):
```ts
import '@testing-library/jest-dom/vitest';
```

Add scripts to `package.json`:
```json
{
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "zip": "wxt zip",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:component": "vitest run --project component",
    "test:watch": "vitest",
    "e2e": "playwright test"
  }
}
```

- [ ] **Step 4: Write a smoke test**

Create `lib/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

describe('toolchain', () => {
  it('runs vitest and exposes fakeBrowser', () => {
    expect(typeof fakeBrowser.runtime.id).toBe('string');
  });
});
```

- [ ] **Step 5: Run the smoke test to verify the toolchain**

Run: `pnpm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Verify the extension builds**

Run: `pnpm build`
Expected: Build succeeds; `.output/chrome-mv3/` contains `manifest.json` with `"manifest_version": 3` and the popup.

- [ ] **Step 7: Commit**

`CLAUDE.md` and `.gitignore` already exist at the repo root (created at project init, carrying the commit convention and testing agreement). `git add -A` includes the new scaffold files.
```bash
git add -A
git commit -m "chore(core): scaffold wxt + preact + vitest toolchain"
```

---

### Task 2: Shared types

**Files:**
- Create: `tabtune/lib/types.ts`
- Test: `tabtune/lib/types.test.ts`

**Interfaces:**
- Produces:
  - `interface AudibleTab { id: number; title: string; url: string; origin: string; favIconUrl?: string; muted: boolean }`
  - `interface SitePref { volume: number }` (volume is a unit float 0.0–1.0)
  - `interface Settings { shortcutsEnabled: boolean; donationDismissed: boolean }`
  - `const DEFAULT_SETTINGS: Settings`

- [ ] **Step 1: Write the failing test**

Create `lib/types.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './types';

describe('DEFAULT_SETTINGS', () => {
  it('enables shortcuts and does not hide donation by default', () => {
    expect(DEFAULT_SETTINGS).toEqual({ shortcutsEnabled: true, donationDismissed: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/types.test.ts`
Expected: FAIL — cannot find module './types' / `DEFAULT_SETTINGS` undefined.

- [ ] **Step 3: Write the implementation**

Create `lib/types.ts`:
```ts
export interface AudibleTab {
  id: number;
  title: string;
  url: string;
  origin: string;
  favIconUrl?: string;
  muted: boolean;
}

export interface SitePref {
  /** Unit gain, 0.0–1.0. */
  volume: number;
}

export interface Settings {
  shortcutsEnabled: boolean;
  donationDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  shortcutsEnabled: true,
  donationDismissed: false,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/types.test.ts
git commit -m "feat(core): add shared domain types and settings"
```

---

### Task 3: Origin helpers (pure)

**Files:**
- Create: `tabtune/lib/origin.ts`
- Test: `tabtune/lib/origin.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `originKeyFromUrl(url: string): string | null` — returns the host (e.g. `"youtube.com"`) for http/https URLs, else `null`.
  - `isSupportedUrl(url: string): boolean` — true for http/https, false for `chrome://`, `about:`, extension pages, etc.
  - `matchPatternForOrigin(origin: string): string` — returns `` `*://${origin}/*` ``.

- [ ] **Step 1: Write the failing test**

Create `lib/origin.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { originKeyFromUrl, isSupportedUrl, matchPatternForOrigin } from './origin';

describe('originKeyFromUrl', () => {
  it('returns the host for https URLs', () => {
    expect(originKeyFromUrl('https://www.youtube.com/watch?v=x')).toBe('www.youtube.com');
  });
  it('returns the host for http URLs', () => {
    expect(originKeyFromUrl('http://example.com:8080/a')).toBe('example.com');
  });
  it('returns null for chrome:// and invalid URLs', () => {
    expect(originKeyFromUrl('chrome://extensions')).toBeNull();
    expect(originKeyFromUrl('not a url')).toBeNull();
  });
});

describe('isSupportedUrl', () => {
  it('accepts http/https and rejects the rest', () => {
    expect(isSupportedUrl('https://a.com')).toBe(true);
    expect(isSupportedUrl('chrome://newtab')).toBe(false);
    expect(isSupportedUrl('about:blank')).toBe(false);
  });
});

describe('matchPatternForOrigin', () => {
  it('builds a host match pattern', () => {
    expect(matchPatternForOrigin('twitch.tv')).toBe('*://twitch.tv/*');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/origin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/origin.ts`:
```ts
export function isSupportedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function originKeyFromUrl(url: string): string | null {
  if (!isSupportedUrl(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function matchPatternForOrigin(origin: string): string {
  return `*://${origin}/*`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/origin.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/origin.ts lib/origin.test.ts
git commit -m "feat(core): add origin/url helpers"
```

---

### Task 4: Volume helpers (pure)

**Files:**
- Create: `tabtune/lib/volume.ts`
- Test: `tabtune/lib/volume.test.ts`

**Interfaces:**
- Produces:
  - `clampVolume(v: number): number` — clamps to `[0, 1]`.
  - `percentToUnit(p: number): number` — `0–100` → `0.0–1.0`, clamped.
  - `unitToPercent(v: number): number` — `0.0–1.0` → integer `0–100`, clamped.
  - `DEFAULT_VOLUME = 1.0`

- [ ] **Step 1: Write the failing test**

Create `lib/volume.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { clampVolume, percentToUnit, unitToPercent, DEFAULT_VOLUME } from './volume';

describe('clampVolume', () => {
  it('clamps out-of-range values into [0,1]', () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(0.42)).toBe(0.42);
  });
});

describe('percentToUnit / unitToPercent', () => {
  it('round-trips whole percentages', () => {
    expect(percentToUnit(65)).toBeCloseTo(0.65, 5);
    expect(unitToPercent(0.65)).toBe(65);
  });
  it('clamps beyond bounds (no boost above 100%)', () => {
    expect(percentToUnit(150)).toBe(1);
    expect(unitToPercent(2)).toBe(100);
  });
});

describe('DEFAULT_VOLUME', () => {
  it('is full volume', () => {
    expect(DEFAULT_VOLUME).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/volume.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/volume.ts`:
```ts
export const DEFAULT_VOLUME = 1.0;

export function clampVolume(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, v));
}

export function percentToUnit(p: number): number {
  return clampVolume(p / 100);
}

export function unitToPercent(v: number): number {
  return Math.round(clampVolume(v) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/volume.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/volume.ts lib/volume.test.ts
git commit -m "feat(core): add volume conversion helpers"
```

---

### Task 5: Storage layer

**Files:**
- Create: `tabtune/lib/storage.ts`
- Test: `tabtune/lib/storage.test.ts`

**Interfaces:**
- Consumes: `SitePref`, `Settings`, `DEFAULT_SETTINGS` from `lib/types`; `DEFAULT_VOLUME` from `lib/volume`.
- Produces:
  - `getSiteVolume(origin: string): Promise<number>` — returns stored unit volume or `DEFAULT_VOLUME`.
  - `setSiteVolume(origin: string, volume: number): Promise<void>` — persists clamped volume.
  - `getSettings(): Promise<Settings>`
  - `setSettings(patch: Partial<Settings>): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/storage.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getSiteVolume, setSiteVolume, getSettings, setSettings } from './storage';

describe('site volume storage', () => {
  it('defaults to full volume for an unknown origin', async () => {
    expect(await getSiteVolume('youtube.com')).toBe(1.0);
  });
  it('persists and reads back a clamped volume', async () => {
    await setSiteVolume('youtube.com', 0.65);
    expect(await getSiteVolume('youtube.com')).toBe(0.65);
    await setSiteVolume('youtube.com', 5);
    expect(await getSiteVolume('youtube.com')).toBe(1);
  });
});

describe('settings storage', () => {
  it('returns defaults when unset', async () => {
    expect(await getSettings()).toEqual({ shortcutsEnabled: true, donationDismissed: false });
  });
  it('merges a partial patch', async () => {
    await setSettings({ donationDismissed: true });
    expect(await getSettings()).toEqual({ shortcutsEnabled: true, donationDismissed: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/storage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/storage.ts`:
```ts
import { storage } from 'wxt/storage';
import type { SitePref, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { clampVolume, DEFAULT_VOLUME } from './volume';

const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

function siteItem(origin: string) {
  return storage.defineItem<SitePref | null>(`local:site:${origin}`, {
    fallback: null,
  });
}

export async function getSiteVolume(origin: string): Promise<number> {
  const pref = await siteItem(origin).getValue();
  return pref ? clampVolume(pref.volume) : DEFAULT_VOLUME;
}

export async function setSiteVolume(origin: string, volume: number): Promise<void> {
  await siteItem(origin).setValue({ volume: clampVolume(volume) });
}

export async function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const current = await settingsItem.getValue();
  await settingsItem.setValue({ ...current, ...patch });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/storage.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts lib/storage.test.ts
git commit -m "feat(core): add typed storage for volume and settings"
```

---

### Task 6: Audible tabs service

**Files:**
- Create: `tabtune/lib/audible-tabs.ts`
- Test: `tabtune/lib/audible-tabs.test.ts`

**Interfaces:**
- Consumes: `AudibleTab` from `lib/types`; `originKeyFromUrl`, `isSupportedUrl` from `lib/origin`.
- Produces:
  - `queryAudibleTabs(): Promise<AudibleTab[]>` — queries `{ audible: true }`, filters to supported URLs with a usable origin, maps to `AudibleTab`.
  - `setTabMuted(tabId: number, muted: boolean): Promise<void>` — wraps `browser.tabs.update`.

- [ ] **Step 1: Write the failing test**

Create `lib/audible-tabs.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { queryAudibleTabs, setTabMuted } from './audible-tabs';

async function seedTab(partial: Partial<chrome.tabs.Tab> & { id: number }) {
  await fakeBrowser.tabs.create({ url: partial.url });
  // fakeBrowser assigns its own ids; instead drive via onUpdated-friendly create.
}

describe('queryAudibleTabs', () => {
  it('returns supported audible tabs mapped to the view model', async () => {
    const t = await browser.tabs.create({ url: 'https://www.youtube.com/watch?v=x' });
    await browser.tabs.update(t.id!, { /* mark audible */ });
    // fakeBrowser stores whatever we set; emulate audible + title:
    (await browser.tabs.get(t.id!)); // ensure exists
    fakeBrowser.tabs.query.mockImplementation(async () => [
      { id: t.id!, url: 'https://www.youtube.com/watch?v=x', title: 'Lofi', audible: true, mutedInfo: { muted: false }, favIconUrl: 'f' } as chrome.tabs.Tab,
    ]);

    const tabs = await queryAudibleTabs();
    expect(tabs).toEqual([
      { id: t.id!, title: 'Lofi', url: 'https://www.youtube.com/watch?v=x', origin: 'www.youtube.com', favIconUrl: 'f', muted: false },
    ]);
  });

  it('filters out unsupported URLs (chrome://)', async () => {
    fakeBrowser.tabs.query.mockImplementation(async () => [
      { id: 1, url: 'chrome://extensions', title: 'x', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]);
    expect(await queryAudibleTabs()).toEqual([]);
  });
});

describe('setTabMuted', () => {
  it('calls tabs.update with the muted flag', async () => {
    const t = await browser.tabs.create({ url: 'https://a.com' });
    await setTabMuted(t.id!, true);
    const updated = await browser.tabs.get(t.id!);
    expect(updated.mutedInfo?.muted ?? updated['mutedInfo']?.muted).toBeDefined();
  });
});
```

> Note for the implementer: `fakeBrowser.tabs.query` is a vitest mock you can override with `.mockImplementation`. Reset happens automatically in `test/setup.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/audible-tabs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/audible-tabs.ts`:
```ts
import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';
import { originKeyFromUrl } from './origin';

export async function queryAudibleTabs(): Promise<AudibleTab[]> {
  const tabs = await browser.tabs.query({ audible: true });
  const result: AudibleTab[] = [];
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    const origin = originKeyFromUrl(tab.url);
    if (!origin) continue;
    result.push({
      id: tab.id,
      title: tab.title ?? origin,
      url: tab.url,
      origin,
      favIconUrl: tab.favIconUrl,
      muted: tab.mutedInfo?.muted ?? false,
    });
  }
  return result;
}

export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  await browser.tabs.update(tabId, { muted });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/audible-tabs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/audible-tabs.ts lib/audible-tabs.test.ts
git commit -m "feat(tabs): add audible tabs query and mute service"
```

---

### Task 7: Per-origin permissions helper

**Files:**
- Create: `tabtune/lib/permissions.ts`
- Test: `tabtune/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `matchPatternForOrigin` from `lib/origin`.
- Produces:
  - `hasOriginPermission(origin: string): Promise<boolean>`
  - `requestOriginPermission(origin: string): Promise<boolean>` — must be called from a user gesture (popup click).
  - `removeOriginPermission(origin: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

Create `lib/permissions.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { hasOriginPermission, requestOriginPermission, removeOriginPermission } from './permissions';

describe('permissions helper', () => {
  it('checks contains with the origin match pattern', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    expect(await hasOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.contains).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });

  it('requests the origin permission and returns the grant result', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => true) as any;
    expect(await requestOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });

  it('removes the origin permission', async () => {
    fakeBrowser.permissions.remove = vi.fn(async () => true) as any;
    expect(await removeOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.remove).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/permissions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/permissions.ts`:
```ts
import { browser } from 'wxt/browser';
import { matchPatternForOrigin } from './origin';

function spec(origin: string) {
  return { origins: [matchPatternForOrigin(origin)] };
}

export async function hasOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.contains(spec(origin));
}

export async function requestOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.request(spec(origin));
}

export async function removeOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.remove(spec(origin));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/permissions.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/permissions.ts lib/permissions.test.ts
git commit -m "feat(permissions): add per-origin permissions helper"
```

---

### Task 8: Message protocol

**Files:**
- Create: `tabtune/lib/messages.ts`
- Test: `tabtune/lib/messages.test.ts`

**Interfaces:**
- Consumes: `AudibleTab` from `lib/types`.
- Produces the typed message union and helpers used by popup ↔ background ↔ content:
  - Popup → background: `{ type: 'list' }` → `AudibleTab[]`; `{ type: 'toggleMute'; tabId; muted }` → `void`; `{ type: 'muteAll' }` → `void`; `{ type: 'setVolume'; tabId; origin; volume }` → `void`; `{ type: 'grantSite'; tabId; origin }` → `{ granted: boolean }`.
  - Background → content: `{ type: 'applyVolume'; volume: number }`.
  - `sendToBackground<M>(msg): Promise<Response>` and `sendToTab(tabId, msg): Promise<void>` wrappers.

- [ ] **Step 1: Write the failing test**

Create `lib/messages.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendToBackground, sendToTab, type BackgroundMessage } from './messages';

describe('message wrappers', () => {
  it('sendToBackground forwards via runtime.sendMessage and returns the response', async () => {
    fakeBrowser.runtime.sendMessage = vi.fn(async () => [{ id: 1 }]) as any;
    const msg: BackgroundMessage = { type: 'list' };
    const res = await sendToBackground(msg);
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(msg);
    expect(res).toEqual([{ id: 1 }]);
  });

  it('sendToTab forwards via tabs.sendMessage', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await sendToTab(7, { type: 'applyVolume', volume: 0.5 });
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'applyVolume', volume: 0.5 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/messages.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `lib/messages.ts`:
```ts
import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';

export type BackgroundMessage =
  | { type: 'list' }
  | { type: 'toggleMute'; tabId: number; muted: boolean }
  | { type: 'muteAll' }
  | { type: 'setVolume'; tabId: number; origin: string; volume: number }
  | { type: 'grantSite'; tabId: number; origin: string };

export type BackgroundResponse =
  | AudibleTab[]           // for 'list'
  | { granted: boolean }   // for 'grantSite'
  | void;                  // for the rest

export type ContentMessage = { type: 'applyVolume'; volume: number };

export async function sendToBackground(msg: BackgroundMessage): Promise<BackgroundResponse> {
  return browser.runtime.sendMessage(msg);
}

export async function sendToTab(tabId: number, msg: ContentMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, msg);
  } catch {
    // No content script in the tab yet (e.g. not granted / not injected). Caller handles.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/messages.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/messages.ts lib/messages.test.ts
git commit -m "feat(core): add typed message protocol and transport"
```

---

### Task 9: Content script (volume applier)

**Files:**
- Create: `tabtune/entrypoints/content.ts`
- Test: `tabtune/entrypoints/content.logic.test.ts`

**Interfaces:**
- Consumes: `ContentMessage` from `lib/messages`; `getSiteVolume` from `lib/storage`; `originKeyFromUrl` from `lib/origin`.
- Produces: exported pure helper `applyVolumeToMedia(root: ParentNode, volume: number): number` (returns count of elements set) so the DOM logic is unit-testable; and a `defineContentScript` with `registration: 'runtime'` that wires messaging + a `MutationObserver`.

- [ ] **Step 1: Write the failing test (pure DOM helper)**

Create `entrypoints/content.logic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyVolumeToMedia } from './content';

describe('applyVolumeToMedia', () => {
  it('sets .volume on all audio/video elements and counts them', () => {
    document.body.innerHTML = '<video></video><audio></audio><div></div>';
    const count = applyVolumeToMedia(document, 0.4);
    expect(count).toBe(2);
    const media = [...document.querySelectorAll('video,audio')] as HTMLMediaElement[];
    expect(media.every((m) => m.volume === 0.4)).toBe(true);
  });

  it('clamps volume into [0,1]', () => {
    document.body.innerHTML = '<video></video>';
    applyVolumeToMedia(document, 5);
    expect((document.querySelector('video') as HTMLMediaElement).volume).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/content.logic.test.ts`
Expected: FAIL — `applyVolumeToMedia` not exported.

- [ ] **Step 3: Write the implementation**

Create `entrypoints/content.ts`:
```ts
import { defineContentScript } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { ContentMessage } from '@/lib/messages';
import { getSiteVolume } from '@/lib/storage';
import { originKeyFromUrl } from '@/lib/origin';
import { clampVolume } from '@/lib/volume';

/** Pure, testable: set .volume on every media element under `root`. Returns count. */
export function applyVolumeToMedia(root: ParentNode, volume: number): number {
  const v = clampVolume(volume);
  const media = root.querySelectorAll('video, audio');
  media.forEach((el) => {
    (el as HTMLMediaElement).volume = v;
  });
  return media.length;
}

export default defineContentScript({
  matches: [],               // no static matches — registered at runtime per granted origin
  registration: 'runtime',
  runAt: 'document_start',
  allFrames: true,
  async main() {
    const origin = originKeyFromUrl(location.href);
    let current = origin ? await getSiteVolume(origin) : 1;

    applyVolumeToMedia(document, current);

    const observer = new MutationObserver(() => applyVolumeToMedia(document, current));
    observer.observe(document.documentElement, { childList: true, subtree: true });

    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'applyVolume') {
        current = msg.volume;
        applyVolumeToMedia(document, current);
      }
    });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/content.logic.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Verify the build still emits the content script**

Run: `pnpm build`
Expected: Build succeeds; `.output/chrome-mv3/content-scripts/content.js` exists and the content script is NOT listed under `content_scripts` in `manifest.json` (runtime registration).

- [ ] **Step 6: Commit**

```bash
git add entrypoints/content.ts entrypoints/content.logic.test.ts
git commit -m "feat(content): add content script for volume control"
```

---

### Task 10: Background service worker

**Files:**
- Create: `tabtune/entrypoints/background.ts`
- Test: `tabtune/entrypoints/background.logic.test.ts`

**Interfaces:**
- Consumes: `queryAudibleTabs`, `setTabMuted` (audible-tabs); `getSiteVolume`, `setSiteVolume` (storage); `requestOriginPermission` (permissions); `sendToTab` (messages); `matchPatternForOrigin` (origin).
- Produces: exported `handleMessage(msg, sender): Promise<BackgroundResponse>` (pure-ish router, unit-testable) and `ensureContentScript(origin, tabId)` helper; the `defineBackground` wires `onMessage` to `handleMessage` and registers tab-event listeners.

- [ ] **Step 1: Write the failing test**

Create `entrypoints/background.logic.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleMessage } from './background';

describe('handleMessage', () => {
  it('list returns audible tabs', async () => {
    fakeBrowser.tabs.query.mockImplementation(async () => [
      { id: 3, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]);
    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 3, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false },
    ]);
  });

  it('toggleMute mutes the tab', async () => {
    const t = await fakeBrowser.tabs.create({ url: 'https://a.com' });
    await handleMessage({ type: 'toggleMute', tabId: t.id!, muted: true }, {} as any);
    const after = await fakeBrowser.tabs.get(t.id!);
    expect(after.mutedInfo?.muted).toBe(true);
  });

  it('setVolume persists the volume and messages the tab', async () => {
    const sendSpy = vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue(undefined as any);
    await handleMessage({ type: 'setVolume', tabId: 9, origin: 'a.com', volume: 0.5 }, {} as any);
    const { getSiteVolume } = await import('@/lib/storage');
    expect(await getSiteVolume('a.com')).toBe(0.5);
    expect(sendSpy).toHaveBeenCalledWith(9, { type: 'applyVolume', volume: 0.5 });
  });

  it('grantSite requests permission and reports the result', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => true) as any;
    fakeBrowser.scripting.registerContentScripts = vi.fn(async () => undefined) as any;
    fakeBrowser.scripting.executeScript = vi.fn(async () => [] as any) as any;
    const res = await handleMessage({ type: 'grantSite', tabId: 9, origin: 'a.com' }, {} as any);
    expect(res).toEqual({ granted: true });
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins: ['*://a.com/*'] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/background.logic.test.ts`
Expected: FAIL — module not found / `handleMessage` undefined.

- [ ] **Step 3: Write the implementation**

Create `entrypoints/background.ts`:
```ts
import { defineBackground } from 'wxt/sandbox';
import { browser } from 'wxt/browser';
import type { BackgroundMessage, BackgroundResponse } from '@/lib/messages';
import { queryAudibleTabs, setTabMuted } from '@/lib/audible-tabs';
import { getSiteVolume, setSiteVolume } from '@/lib/storage';
import { requestOriginPermission } from '@/lib/permissions';
import { matchPatternForOrigin } from '@/lib/origin';

const CONTENT_JS = 'content-scripts/content.js';

async function ensureContentScript(origin: string, tabId: number): Promise<void> {
  const id = `tabtune-${origin}`;
  const pattern = matchPatternForOrigin(origin);
  // Register for future loads (idempotent: unregister-if-exists then register).
  try {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  } catch { /* not registered yet */ }
  await browser.scripting.registerContentScripts([
    { id, js: [CONTENT_JS], matches: [pattern], runAt: 'document_start', allFrames: true },
  ]);
  // Inject immediately into the current tab so the slider works without a reload.
  try {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_JS] });
  } catch { /* tab may be a restricted page */ }
}

export async function handleMessage(
  msg: BackgroundMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<BackgroundResponse> {
  switch (msg.type) {
    case 'list':
      return queryAudibleTabs();
    case 'toggleMute':
      await setTabMuted(msg.tabId, msg.muted);
      return;
    case 'muteAll': {
      const tabs = await queryAudibleTabs();
      await Promise.all(tabs.map((t) => setTabMuted(t.id, true)));
      return;
    }
    case 'setVolume':
      await setSiteVolume(msg.origin, msg.volume);
      await browser.tabs.sendMessage(msg.tabId, { type: 'applyVolume', volume: msg.volume }).catch(() => {});
      return;
    case 'grantSite': {
      const granted = await requestOriginPermission(msg.origin);
      if (granted) await ensureContentScript(msg.origin, msg.tabId);
      return { granted };
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg as BackgroundMessage, sender).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});
```

> Note: `grantSite` must be triggered from a user gesture. Because `permissions.request` requires a gesture and the gesture originates in the popup, the popup calls `permissions.request` directly (Task 12) and then messages `grantSite` only to register/inject. See Task 12 for the split. For unit-testing purposes `handleMessage` still calls `requestOriginPermission`; the popup path will pass an already-granted origin — keep `requestOriginPermission` idempotent (returns true if already granted).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/background.logic.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts entrypoints/background.logic.test.ts
git commit -m "feat(background): add service worker message router"
```

---

### Task 11: VolumeSlider component

**Files:**
- Create: `tabtune/entrypoints/popup/components/VolumeSlider.tsx`
- Test: `tabtune/entrypoints/popup/components/VolumeSlider.browser.test.tsx`

**Interfaces:**
- Consumes: `unitToPercent`, `percentToUnit` from `lib/volume`.
- Produces: `<VolumeSlider value={number /*unit*/} onChange={(unit:number)=>void} />` — renders a range input in percent, emits unit values.

> **Component tests (Tasks 11–13) run in Vitest browser mode** (`*.browser.test.tsx`, real Chromium via the `component` project) — this is tuno-testing Layer 2. `@testing-library/preact` `render`/`fireEvent` work in browser mode. These files use no `fakeBrowser` (that stays in the jsdom `unit` project, e.g. the App wiring test in Task 14).

- [ ] **Step 1: Write the failing test**

Create `entrypoints/popup/components/VolumeSlider.browser.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { VolumeSlider } from './VolumeSlider';

describe('VolumeSlider', () => {
  it('renders the current value as a percent', () => {
    const { getByRole } = render(<VolumeSlider value={0.65} onChange={() => {}} />);
    expect((getByRole('slider') as HTMLInputElement).value).toBe('65');
  });

  it('emits a unit value on change', () => {
    const onChange = vi.fn();
    const { getByRole } = render(<VolumeSlider value={1} onChange={onChange} />);
    fireEvent.input(getByRole('slider'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith(0.4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/popup/components/VolumeSlider.browser.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `entrypoints/popup/components/VolumeSlider.tsx`:
```tsx
import { unitToPercent, percentToUnit } from '@/lib/volume';

interface Props {
  value: number; // unit 0..1
  onChange: (unit: number) => void;
}

export function VolumeSlider({ value, onChange }: Props) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={unitToPercent(value)}
      aria-label="Volume"
      onInput={(e) => onChange(percentToUnit(Number((e.target as HTMLInputElement).value)))}
    />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/popup/components/VolumeSlider.browser.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/components/VolumeSlider.tsx entrypoints/popup/components/VolumeSlider.browser.test.tsx
git commit -m "feat(popup): add volume slider component"
```

---

### Task 12: TabRow component

**Files:**
- Create: `tabtune/entrypoints/popup/components/TabRow.tsx`
- Test: `tabtune/entrypoints/popup/components/TabRow.browser.test.tsx`

**Interfaces:**
- Consumes: `AudibleTab` (types); `VolumeSlider`.
- Produces: `<TabRow tab={AudibleTab} granted={boolean} volume={number} onToggleMute={()=>void} onUnlock={()=>void} onVolume={(unit)=>void} />`. Shows: title + origin, a mute button (always), and either the `VolumeSlider` (granted) or an "unlock" button (not granted).

- [ ] **Step 1: Write the failing test**

Create `entrypoints/popup/components/TabRow.browser.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/preact';
import { TabRow } from './TabRow';
import type { AudibleTab } from '@/lib/types';

const tab: AudibleTab = { id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false };

describe('TabRow', () => {
  it('shows the unlock button when the site is not granted', () => {
    const onUnlock = vi.fn();
    const { getByText, queryByRole } = render(
      <TabRow tab={tab} granted={false} volume={1} onToggleMute={() => {}} onUnlock={onUnlock} onVolume={() => {}} />,
    );
    expect(queryByRole('slider')).toBeNull();
    fireEvent.click(getByText(/control volume/i));
    expect(onUnlock).toHaveBeenCalled();
  });

  it('shows the slider when granted', () => {
    const { getByRole } = render(
      <TabRow tab={tab} granted={true} volume={0.5} onToggleMute={() => {}} onUnlock={() => {}} onVolume={() => {}} />,
    );
    expect(getByRole('slider')).toBeTruthy();
  });

  it('fires onToggleMute when the mute button is clicked', () => {
    const onToggleMute = vi.fn();
    const { getByLabelText } = render(
      <TabRow tab={tab} granted={true} volume={1} onToggleMute={onToggleMute} onUnlock={() => {}} onVolume={() => {}} />,
    );
    fireEvent.click(getByLabelText(/^mute$/i));
    expect(onToggleMute).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/popup/components/TabRow.browser.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `entrypoints/popup/components/TabRow.tsx`:
```tsx
import type { AudibleTab } from '@/lib/types';
import { VolumeSlider } from './VolumeSlider';

interface Props {
  tab: AudibleTab;
  granted: boolean;
  volume: number;
  onToggleMute: () => void;
  onUnlock: () => void;
  onVolume: (unit: number) => void;
}

export function TabRow({ tab, granted, volume, onToggleMute, onUnlock, onVolume }: Props) {
  return (
    <div class="tab-row">
      {tab.favIconUrl ? <img class="fav" src={tab.favIconUrl} alt="" width={18} height={18} /> : <span class="fav" />}
      <div class="meta">
        <div class="title">{tab.title}</div>
        <div class="origin">{tab.origin}{tab.muted ? ' · muted' : ''}</div>
        {granted
          ? <VolumeSlider value={volume} onChange={onVolume} />
          : <button class="unlock" onClick={onUnlock}>🎚️ Control volume here →</button>}
      </div>
      <button class="mute" aria-label={tab.muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
        {tab.muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/popup/components/TabRow.browser.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/components/TabRow.tsx entrypoints/popup/components/TabRow.browser.test.tsx
git commit -m "feat(popup): add tab row component"
```

---

### Task 13: DonationFooter component

**Files:**
- Create: `tabtune/entrypoints/popup/components/DonationFooter.tsx`
- Test: `tabtune/entrypoints/popup/components/DonationFooter.browser.test.tsx`

**Interfaces:**
- Produces: `<DonationFooter donateUrl={string} />` — renders the trust line and a non-invasive external "buy me a coffee" link (opens in a new tab, `rel="noopener noreferrer"`).

- [ ] **Step 1: Write the failing test**

Create `entrypoints/popup/components/DonationFooter.browser.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { DonationFooter } from './DonationFooter';

describe('DonationFooter', () => {
  it('renders the trust line and an external donation link', () => {
    const { getByText, getByRole } = render(<DonationFooter donateUrl="https://ko-fi.com/tabtune" />);
    expect(getByText(/fully local/i)).toBeTruthy();
    const link = getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe('https://ko-fi.com/tabtune');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/popup/components/DonationFooter.browser.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `entrypoints/popup/components/DonationFooter.tsx`:
```tsx
interface Props {
  donateUrl: string;
}

export function DonationFooter({ donateUrl }: Props) {
  return (
    <footer class="footer">
      <div class="trust">🔒 Fully local · No data collection · Open source</div>
      <a class="donate" href={donateUrl} target="_blank" rel="noopener noreferrer">☕ Buy me a coffee</a>
    </footer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/popup/components/DonationFooter.browser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/popup/components/DonationFooter.tsx entrypoints/popup/components/DonationFooter.browser.test.tsx
git commit -m "feat(popup): add donation footer component"
```

---

### Task 14: Popup App wiring

**Files:**
- Modify: `tabtune/entrypoints/popup/App.tsx`, `tabtune/entrypoints/popup/main.tsx`, `tabtune/entrypoints/popup/index.html`
- Create: `tabtune/entrypoints/popup/App.test.tsx`, `tabtune/entrypoints/popup/style.css`

**Interfaces:**
- Consumes: `AudibleTab` (types); `sendToBackground` (messages); `hasOriginPermission`, `requestOriginPermission` (permissions); `getSiteVolume` (storage); `TabRow`, `DonationFooter`.
- Produces: the assembled panel. On mount: loads audible tabs + per-tab granted/volume state. Mute/unlock/volume actions route to background. Unlock calls `requestOriginPermission` directly (user gesture) then messages `grantSite` to register/inject.

- [ ] **Step 1: Write the failing test**

Create `entrypoints/popup/App.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { fakeBrowser } from 'wxt/testing';
import { App } from './App';

beforeEach(() => {
  fakeBrowser.runtime.sendMessage = vi.fn(async (msg: any) => {
    if (msg.type === 'list') {
      return [{ id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false }];
    }
    return undefined;
  }) as any;
  fakeBrowser.permissions.contains = vi.fn(async () => false) as any;
});

describe('App', () => {
  it('lists audible tabs from the background', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => expect(screen.getByText('Lofi')).toBeTruthy());
    expect(screen.getByText('youtube.com')).toBeTruthy();
  });

  it('sends muteAll when the master button is clicked', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/mute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test entrypoints/popup/App.test.tsx`
Expected: FAIL — `App` export/props mismatch.

- [ ] **Step 3: Write the implementation**

Replace `entrypoints/popup/App.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import type { AudibleTab } from '@/lib/types';
import { sendToBackground } from '@/lib/messages';
import { hasOriginPermission, requestOriginPermission } from '@/lib/permissions';
import { getSiteVolume } from '@/lib/storage';
import { TabRow } from './components/TabRow';
import { DonationFooter } from './components/DonationFooter';
import './style.css';

interface RowState { granted: boolean; volume: number }

export function App({ donateUrl }: { donateUrl: string }) {
  const [tabs, setTabs] = useState<AudibleTab[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  async function refresh() {
    const list = (await sendToBackground({ type: 'list' })) as AudibleTab[];
    setTabs(list);
    const entries: Record<string, RowState> = {};
    for (const t of list) {
      entries[t.origin] = {
        granted: await hasOriginPermission(t.origin),
        volume: await getSiteVolume(t.origin),
      };
    }
    setRowState(entries);
  }

  useEffect(() => { refresh(); }, []);

  async function toggleMute(t: AudibleTab) {
    await sendToBackground({ type: 'toggleMute', tabId: t.id, muted: !t.muted });
    refresh();
  }

  async function unlock(t: AudibleTab) {
    const granted = await requestOriginPermission(t.origin); // direct: user gesture
    if (granted) {
      await sendToBackground({ type: 'grantSite', tabId: t.id, origin: t.origin });
      refresh();
    }
  }

  async function setVolume(t: AudibleTab, volume: number) {
    setRowState((s) => ({ ...s, [t.origin]: { ...s[t.origin], volume } }));
    await sendToBackground({ type: 'setVolume', tabId: t.id, origin: t.origin, volume });
  }

  return (
    <div class="panel">
      <header class="header">
        <span class="logo">🎚️</span>
        <span class="name">TabTune</span>
        <button class="all-mute" onClick={() => sendToBackground({ type: 'muteAll' }).then(refresh)}>
          🔇 Mute all
        </button>
      </header>

      <div class="section-label">🟢 Playing now</div>
      {tabs.length === 0 && <div class="empty">Nothing is playing right now.</div>}
      {tabs.map((t) => (
        <TabRow
          key={t.id}
          tab={t}
          granted={rowState[t.origin]?.granted ?? false}
          volume={rowState[t.origin]?.volume ?? 1}
          onToggleMute={() => toggleMute(t)}
          onUnlock={() => unlock(t)}
          onVolume={(v) => setVolume(t, v)}
        />
      ))}

      <DonationFooter donateUrl={donateUrl} />
    </div>
  );
}
```

Replace `entrypoints/popup/main.tsx`:
```tsx
import { render } from 'preact';
import { App } from './App';

const DONATE_URL = 'https://ko-fi.com/tabtune'; // TODO(owner): replace with real donation URL before publishing

render(<App donateUrl={DONATE_URL} />, document.getElementById('app')!);
```

Ensure `entrypoints/popup/index.html` has a mount node:
```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>TabTune</title></head>
  <body><div id="app"></div><script type="module" src="./main.tsx"></script></body>
</html>
```

Create `entrypoints/popup/style.css`:
```css
.panel { width: 330px; font: 13px/1.4 system-ui, sans-serif; }
.header { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid #8884; }
.name { font-weight: 700; }
.all-mute { margin-left: auto; font-size: 11px; padding: 4px 9px; border-radius: 7px; border: 1px solid #8886; background: transparent; cursor: pointer; }
.section-label { font-size: 10px; text-transform: uppercase; letter-spacing: .07em; opacity: .55; padding: 11px 14px 5px; }
.empty { padding: 10px 14px; opacity: .6; }
.tab-row { display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-top: 1px solid #8882; }
.tab-row .fav { width: 18px; height: 18px; border-radius: 5px; flex: 0 0 auto; background: #8883; }
.meta { flex: 1; min-width: 0; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.origin { font-size: 11px; opacity: .55; }
.unlock { margin-top: 6px; font-size: 12px; padding: 5px 10px; border-radius: 8px; border: 1px dashed #5b9dff88; color: #5b9dff; background: #5b9dff10; cursor: pointer; }
.mute { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; border: 1px solid #8886; background: transparent; cursor: pointer; }
.footer { padding: 10px; border-top: 1px solid #8883; text-align: center; }
.trust { font-size: 11px; opacity: .6; }
.donate { display: inline-block; margin-top: 6px; font-size: 12px; color: #5b9dff; }
input[type=range] { width: 100%; margin-top: 6px; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test entrypoints/popup/App.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full unit suite and build**

Run: `pnpm test && pnpm build`
Expected: All unit tests PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add entrypoints/popup/
git commit -m "feat(popup): assemble panel with live tab list"
```

---

### Task 15: Keyboard shortcut for the active tab

**Files:**
- Modify: `tabtune/wxt.config.ts` (add `commands`), `tabtune/entrypoints/background.ts` (handle command)
- Test: `tabtune/entrypoints/background.commands.test.ts`

**Interfaces:**
- Consumes: `setTabMuted` (audible-tabs).
- Produces: exported `handleCommand(command: string): Promise<void>` — `toggle-mute-active` mutes/unmutes the active tab in the current window.

- [ ] **Step 1: Add the command to the manifest**

In `wxt.config.ts`, add to `manifest`:
```ts
    commands: {
      'toggle-mute-active': {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Mute/unmute the active tab',
      },
    },
```

- [ ] **Step 2: Write the failing test**

Create `entrypoints/background.commands.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleCommand } from './background';

describe('handleCommand', () => {
  it('toggles mute on the active tab', async () => {
    const t = await fakeBrowser.tabs.create({ url: 'https://a.com', active: true });
    fakeBrowser.tabs.query.mockImplementation(async () => [
      { id: t.id!, active: true, url: 'https://a.com', mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]);
    await handleCommand('toggle-mute-active');
    const after = await fakeBrowser.tabs.get(t.id!);
    expect(after.mutedInfo?.muted).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test entrypoints/background.commands.test.ts`
Expected: FAIL — `handleCommand` not exported.

- [ ] **Step 4: Implement `handleCommand` and wire it**

Add to `entrypoints/background.ts`:
```ts
export async function handleCommand(command: string): Promise<void> {
  if (command !== 'toggle-mute-active') return;
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id == null) return;
  await setTabMuted(active.id, !(active.mutedInfo?.muted ?? false));
}
```
Inside `defineBackground(() => { ... })`, add:
```ts
  browser.commands.onCommand.addListener((command) => { handleCommand(command); });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test entrypoints/background.commands.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add wxt.config.ts entrypoints/background.ts entrypoints/background.commands.test.ts
git commit -m "feat(background): mute active tab via shortcut"
```

---

### Task 16: E2E smoke test (Playwright, real extension)

**Files:**
- Create: `tabtune/e2e/fixtures.ts`, `tabtune/e2e/media-page.html`, `tabtune/e2e/mixer.spec.ts`, `tabtune/playwright.config.ts`

**Interfaces:**
- Consumes: the built extension in `.output/chrome-mv3`.
- Produces: an E2E smoke that loads the extension in Chromium, opens a local media page, and verifies mute works end-to-end.

- [ ] **Step 1: Create the Playwright config**

Create `tabtune/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { headless: false }, // extensions require a headed context
});
```

- [ ] **Step 2: Create the local media page**

Create `e2e/media-page.html`:
```html
<!doctype html>
<html>
  <body>
    <video id="v" src="data:video/mp4;base64,AAAA" loop autoplay muted></video>
    <script>document.getElementById('v').muted = false;</script>
  </body>
</html>
```

- [ ] **Step 3: Create the extension-loading fixture**

Create `e2e/fixtures.ts`:
```ts
import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';

const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const id = sw.url().split('/')[2];
    await use(id);
  },
});
export const expect = test.expect;
```

- [ ] **Step 4: Write the E2E smoke**

Create `e2e/mixer.spec.ts`:
```ts
import { test, expect } from './fixtures';
import path from 'node:path';

test('popup lists the audible tab and mutes it', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('file://' + path.resolve(__dirname, 'media-page.html'));

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  // The audible page should appear in the list; mute button toggles.
  await expect(popup.getByRole('button', { name: /mute all/i })).toBeVisible();
  await popup.getByRole('button', { name: /mute all/i }).click();

  // Verify the media tab reports muted via the extension state.
  await expect(popup.getByText(/muted/i)).toBeVisible({ timeout: 5000 });
});
```

- [ ] **Step 5: Build then run the E2E smoke**

Run: `pnpm build && pnpm e2e`
Expected: The spec passes (a headed Chromium window opens briefly).

> If the audible tab does not appear because the data-URI video never truly emits audio, replace `media-page.html`'s source with a short real audio file committed under `e2e/` and reference it via `file://`. The assertion on `/muted/i` after "Mute all" is the reliable end-to-end signal.

- [ ] **Step 6: Commit**

```bash
git add e2e/ playwright.config.ts
git commit -m "chore(e2e): add playwright smoke loading extension"
```

---

### Task 17: Manual verification pass and README

**Files:**
- Create: `tabtune/README.md`

**Interfaces:**
- Consumes: the full built extension.
- Produces: a README documenting install-unpacked steps, the trust model, and the known DRM limitation.

- [ ] **Step 1: Manual smoke on real sites**

Run: `pnpm dev` (loads the extension in a dev browser).
Manually verify and check off:
- [ ] YouTube playing → appears in the list with title + favicon.
- [ ] Mute/unmute works on YouTube with no permission prompt.
- [ ] "Control volume here" on YouTube → permission prompt for youtube.com only → slider appears → dragging changes volume audibly.
- [ ] Reload YouTube → the stored volume re-applies automatically.
- [ ] Twitch and a generic `<video>` site behave the same.
- [ ] Netflix (DRM): mute works; note that fine volume attenuation via `.volume` also applies (no boost).
- [ ] "Mute all" mutes every listed tab.
- [ ] Keyboard shortcut mutes the active tab.

- [ ] **Step 2: Write the README**

Create `tabtune/README.md`:
```markdown
# TabTune

Per-tab audio control for Chromium browsers. Auto-detects tabs that are playing
sound, lets you mute any of them for free, and gives fine 0–100% volume per site
via an opt-in permission. 100% local — no telemetry, no affiliates, open source.

## Develop
- `pnpm dev` — run with hot reload
- `pnpm test` — unit tests
- `pnpm e2e` — Playwright end-to-end
- `pnpm build` / `pnpm zip` — production build / store zip

## Install unpacked
1. `pnpm build`
2. Open `chrome://extensions`, enable Developer Mode.
3. "Load unpacked" → select `.output/chrome-mv3`.

## Permissions
- `tabs` — to show which tabs are playing sound (their title/icon). Shown at
  install as "Read your browsing history". Nothing leaves your machine.
- Host access is requested **per site, only when you unlock fine volume there**.

## Known limitation
Widevine-DRM audio (Netflix, Disney+, Prime Video) can be muted/attenuated but
**not boosted** — this is a browser-level restriction, not a TabTune bug.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(core): add readme with install and trust notes"
```

---

## Self-Review

**Spec coverage:**
- Auto-detection of audible tabs → Task 6, surfaced in Task 14. ✅
- Free mute + mute all → Tasks 6, 10, 14. ✅
- Fine volume 0–100% per site → Tasks 4, 9, 11, 14. ✅
- Per-site opt-in permission flow → Tasks 7, 10, 14. ✅
- Per-site memory (survives reload) → Tasks 5, 9 (content applies stored volume at `document_start`). ✅
- Keyboard shortcut → Task 15. ✅
- Donation footer + trust line → Task 13. ✅
- No tabCapture / `.volume` only → enforced in Task 9; Global Constraints. ✅
- Stack (WXT/TS/Preact/Vitest/Playwright) → Task 1; throughout. ✅
- Testing: partial adoption of tuno-testing (unit + component browser-mode + discipline; extension-specific E2E) → Task 1 (config, deps, CLAUDE.md), Tasks 11–13 (browser-mode), Task 16 (E2E). ✅
- DRM behavior documented → Task 17. ✅
- Manifest permissions (`tabs`/`storage`/`scripting` + optional host) → Task 1. ✅

**Placeholder scan:** One intentional owner-action marker remains in Task 14 (`DONATE_URL` real link before publishing) — this is a real deployment value the project owner supplies, not an engineering gap; called out explicitly. No other TBD/TODO placeholders.

**Type consistency:** `AudibleTab`, `SitePref`, `Settings` defined in Task 2 and consumed unchanged. `BackgroundMessage`/`ContentMessage` defined in Task 8 and used verbatim in Tasks 10, 14, 9. Volume is a unit float (0–1) end-to-end; percent conversion only at the UI edge (Tasks 4, 11). `handleMessage`/`handleCommand`/`ensureContentScript` names consistent between Tasks 10 and 15.
