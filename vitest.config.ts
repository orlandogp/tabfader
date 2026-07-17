import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    globals: true,
    // NOTE: passWithNoTests is a root-only option in Vitest 4 (NonProjectOptions),
    // not settable per-project. Needed so `test:component` doesn't exit 1 until the
    // first *.browser.test.tsx lands.
    passWithNoTests: true,
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
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
