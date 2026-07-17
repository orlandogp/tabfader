import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        // WxtVitest() is scoped to the `unit` project only (not root-level) — see
        // note below on the `component` project for why.
        plugins: [WxtVitest()],
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
        // Deliberately NOT using WxtVitest() here. Its extensionApiMock sub-plugin
        // injects a `virtual:wxt-setup` module (stubs `chrome`/`browser` globals
        // with `fakeBrowser`) into `test.setupFiles` via a Vite `config()` hook.
        // That works for the `unit` project (Node/jsdom, loaded through
        // vite-node's ssrLoadModule, which resolves virtual module ids via the
        // plugin container). It is fundamentally broken for this `component`
        // project: Vitest browser mode feeds `setupFiles` straight into Vite's
        // `optimizeDeps.entries` for an esbuild pre-bundle scan, which treats each
        // entry as a real filesystem path rather than resolving it through the
        // plugin's `resolveId` hook — so `virtual:wxt-setup` is requested as
        // `@fs/<root>/virtual:wxt-setup`, a nonexistent file, and every test file
        // fails to import with "Failed to fetch dynamically imported module".
        // This matches the plan: component/browser tests use no `fakeBrowser`
        // (that's jsdom-only, e.g. Task 14's App wiring test), so dropping the
        // plugin here is correct, not just a workaround. We still need the `@/`
        // path alias WxtVitest would otherwise provide via tsconfigPaths, so it's
        // added directly below.
        resolve: {
          alias: {
            '@': path.resolve(__dirname),
          },
        },
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
