import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// NOTE: Edge is optional for contributors: without it the msedge project is left out (with a
// notice) instead of failing every test on a missing browser.
function edgeInstalled(): boolean {
  const env = process.env;
  const candidates = {
    win32: [env['PROGRAMFILES(X86)'], env.PROGRAMFILES, env.LOCALAPPDATA]
      .filter((dir): dir is string => Boolean(dir))
      .map((dir) => path.join(dir, 'Microsoft', 'Edge', 'Application', 'msedge.exe')),
    darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    linux: ['/opt/microsoft/msedge/msedge', '/usr/bin/microsoft-edge'],
  }[process.platform as 'win32' | 'darwin' | 'linux'] ?? [];
  return candidates.some((file) => fs.existsSync(file));
}

const withEdge = edgeInstalled();
if (!withEdge) console.warn('[e2e] Microsoft Edge not found: running Chromium only.');

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // NOTE: every test drives real audio and the real tabs API of ONE browser profile;
  // parallel workers would fight over audio focus and `audible` timing.
  workers: 1,
  use: { headless: false }, // extensions require a headed context
  projects: [
    { name: 'chromium' },
    // NOTE: Branded Chrome ignores --load-extension since 137; installed Edge still honours it.
    ...(withEdge ? [{ name: 'msedge', use: { channel: 'msedge' } }] : []),
  ],
  // Route artifacts under e2e/ to match the repo's existing .gitignore
  // entries (e2e/test-results/, e2e/report/) instead of Playwright's
  // default root-level test-results/ and playwright-report/.
  outputDir: './e2e/test-results',
  reporter: [['list'], ['html', { outputFolder: './e2e/report', open: 'never' }]],
});
