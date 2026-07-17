import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';
import { playwright } from '@vitest/browser-playwright';

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
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
