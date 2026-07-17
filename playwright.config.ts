import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { headless: false }, // extensions require a headed context
  // Route artifacts under e2e/ to match the repo's existing .gitignore
  // entries (e2e/test-results/, e2e/report/) instead of Playwright's
  // default root-level test-results/ and playwright-report/.
  outputDir: './e2e/test-results',
  reporter: [['html', { outputFolder: './e2e/report', open: 'never' }]],
});
