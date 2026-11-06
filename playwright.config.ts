import { defineConfig } from '@playwright/test';

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
    { name: 'msedge', use: { channel: 'msedge' } },
  ],
  // Route artifacts under e2e/ to match the repo's existing .gitignore
  // entries (e2e/test-results/, e2e/report/) instead of Playwright's
  // default root-level test-results/ and playwright-report/.
  outputDir: './e2e/test-results',
  reporter: [['list'], ['html', { outputFolder: './e2e/report', open: 'never' }]],
});
