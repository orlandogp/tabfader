import { test as base, chromium, expect as baseExpect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

// package.json has "type": "module", so this file runs as ESM (no CJS
// __dirname global) — derive it from import.meta.url instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NOTE: Built by `pnpm e2e` (`wxt build --mode e2e`), which pre-grants 127.0.0.1 only.
const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3-e2e');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.wav': 'audio/wav',
};

export interface TabState {
  audible: boolean;
  muted: boolean;
}

/** Media page URLs. Every call returns a UNIQUE url so `tabState` can find exactly one tab. */
export interface Site {
  /** 127.0.0.1: host permission pre-granted by the e2e build. */
  granted(title?: string, params?: Record<string, string>): string;
  /** localhost: same server, never granted, so it exercises the opt-in path. */
  ungranted(title?: string, params?: Record<string, string>): string;
}

/**
 * One real browser profile with the extension loaded. Survives `relaunch()` (same
 * userDataDir = a full browser restart) and `reloadExtension()`, so every helper
 * reads the CURRENT context/service worker instead of a captured one.
 */
export class Harness {
  context!: BrowserContext;

  constructor(
    private readonly userDataDir: string,
    private readonly options: { channel?: string; colorScheme?: 'light' | 'dark' | 'no-preference' | null },
  ) {}

  async launch(): Promise<BrowserContext> {
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      channel: this.options.channel,
      colorScheme: this.options.colorScheme ?? undefined,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        // NOTE: The media page autoplays WITH sound so the tab becomes genuinely `audible`.
        // NOTE: never add --mute-audio: it can suppress the `audible` flag entirely.
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    return this.context;
  }

  async sw(): Promise<Worker> {
    const [worker] = this.context.serviceWorkers();
    return worker ?? this.context.waitForEvent('serviceworker');
  }

  async extensionId(): Promise<string> {
    return (await this.sw()).url().split('/')[2];
  }

  async openPopup(): Promise<Page> {
    const popup = await this.context.newPage();
    await popup.goto(`chrome-extension://${await this.extensionId()}/popup.html`);
    await popup.locator('.panel').waitFor();
    return popup;
  }

  async tabState(page: Page): Promise<TabState> {
    const sw = await this.sw();
    return sw.evaluate(async (url) => {
      const tabs = (await chrome.tabs.query({})).filter((t) => t.url === url);
      if (tabs.length !== 1) throw new Error(`expected exactly one tab at ${url}, found ${tabs.length}`);
      return { audible: tabs[0].audible ?? false, muted: tabs[0].mutedInfo?.muted ?? false };
    }, page.url());
  }

  async waitAudible(page: Page, audible: boolean): Promise<void> {
    await baseExpect
      .poll(async () => (await this.tabState(page)).audible, { timeout: 10_000, message: `tab audible=${audible}` })
      .toBe(audible);
  }

  /** Opens a media page and waits until the BROWSER reports it audible. */
  async openPlaying(url: string): Promise<Page> {
    const page = await this.context.newPage();
    await page.goto(url);
    await this.waitAudible(page, true);
    return page;
  }

  /** Full browser restart on the same profile. Pages from the old context are dead. */
  async relaunch(): Promise<BrowserContext> {
    await this.context.close();
    return this.launch();
  }

  /**
   * Reloads the extension the way chrome://extensions' reload button does: the same
   * orphan-then-successor path an extension update takes in already-open tabs.
   */
  async reloadExtension(): Promise<void> {
    const old = await this.sw();
    const id = await this.extensionId();
    const manager = await this.context.newPage();
    await manager.goto('chrome://extensions');
    // NOTE: chrome.runtime.reload() (and a reload outside developer mode) DISABLES a
    // command-line-loaded unpacked extension with `unsupportedDeveloperExtension`, so the
    // reload goes through developerPrivate with developer mode switched on.
    await manager.evaluate(
      () =>
        new Promise((resolve) => {
          // @ts-expect-error chrome.developerPrivate exists only on chrome://extensions
          chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }, resolve);
        }),
    );
    const next = this.context.waitForEvent('serviceworker', { predicate: (w) => w !== old });
    await manager.evaluate(
      (extId) =>
        new Promise((resolve) => {
          // @ts-expect-error chrome.developerPrivate exists only on chrome://extensions
          chrome.developerPrivate.reload(extId, { failQuietly: true }, resolve);
        }),
      id,
    );
    await next;
    await manager.close();
  }

  /**
   * Turns the extension off the way chrome://extensions' toggle does. Already-injected
   * scripts are orphaned with NO successor: the same cleanup path as an uninstall.
   */
  async disableExtension(): Promise<void> {
    const id = await this.extensionId();
    const manager = await this.context.newPage();
    await manager.goto('chrome://extensions');
    await manager.evaluate((extId) => chrome.management.setEnabled(extId, false), id);
    await manager.close();
  }
}

/** Controls the `<audio id="a">` element of a media page. */
export function media(page: Page) {
  return {
    play: () => page.evaluate(() => (document.getElementById('a') as HTMLAudioElement).play()),
    pause: () => page.evaluate(() => (document.getElementById('a') as HTMLAudioElement).pause()),
    volume: () => page.evaluate(() => (document.getElementById('a') as HTMLAudioElement).volume),
    setVolume: (v: number) =>
      page.evaluate((value) => {
        (document.getElementById('a') as HTMLAudioElement).volume = value;
      }, v),
  };
}

export const test = base.extend<{
  ext: Harness;
  context: BrowserContext;
  extensionId: string;
  site: Site;
}>({
  ext: async ({ colorScheme }, use, testInfo) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabfader-e2e-'));
    const harness = new Harness(userDataDir, {
      channel: testInfo.project.use.channel,
      colorScheme,
    });
    await harness.launch();
    await use(harness);
    await harness.context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  },
  context: async ({ ext }, use) => {
    await use(ext.context);
  },
  extensionId: async ({ ext }, use) => {
    await use(await ext.extensionId());
  },
  // NOTE: Serves e2e/ over http on 127.0.0.1 (http/https only: lib/origin.ts drops file:// tabs).
  site: async ({}, use) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url ?? '/').split('?')[0];
      const rel = reqPath === '/' ? 'media-page.html' : decodeURIComponent(reqPath.slice(1));
      const filePath = path.join(__dirname, rel);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' });
        res.end(data);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 0;
    let n = 0;
    const url = (host: string, title?: string, extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ n: String(++n), ...extra });
      if (title) params.set('title', title);
      return `http://${host}:${port}/media-page.html?${params}`;
    };
    await use({
      granted: (title, params) => url('127.0.0.1', title, params),
      ungranted: (title, params) => url('localhost', title, params),
    });
    server.closeAllConnections(); // keep-alive sockets from the browser would block close()
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});
export const expect = test.expect;
