import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

// package.json has "type": "module", so this file runs as ESM (no CJS
// __dirname global) — derive it from import.meta.url instead.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EXT_PATH = path.resolve(__dirname, '../.output/chrome-mv3');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.wav': 'audio/wav',
};

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  mediaPageUrl: string;
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${EXT_PATH}`,
        `--load-extension=${EXT_PATH}`,
        // Task 16 risk mitigation: the media page autoplays audio with sound
        // (not muted) so the extension can observe a real `audible: true`
        // tab. Chromium blocks that by default without a user gesture.
        // NOTE: do NOT add --mute-audio — that can suppress the `audible`
        // flag entirely and would defeat the test.
        '--autoplay-policy=no-user-gesture-required',
      ],
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
  // Serves e2e/media-page.html (and its audio asset) over http://127.0.0.1
  // instead of file://. This matters: lib/origin.ts's `isSupportedUrl` only
  // recognizes http/https protocols, so `queryAudibleTabs` (lib/audible-tabs.ts)
  // silently drops file:// tabs via its `if (!origin) continue;` check —
  // regardless of whether Chrome itself reports the tab as audible. A file://
  // media page would therefore never appear in the popup's list at all.
  mediaPageUrl: async ({}, use) => {
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
    await use(`http://127.0.0.1:${port}/media-page.html`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  },
});
export const expect = test.expect;
