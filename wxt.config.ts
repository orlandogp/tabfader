import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// NOTE: @wxt-dev/module-preact does not exist (WXT only ships official modules for
// React, Vue, Svelte, Solid). Per WXT's own docs, frameworks without a dedicated
// module are wired up via their Vite plugin directly.
export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  hooks: {
    // WXT derives an entrypoint's name from the path segment before the first
    // "." or "/" (wxt/dist/core/utils/entrypoints.mjs getEntrypointName), so a
    // colocated unit test like `entrypoints/content.logic.test.ts` resolves to
    // the same name ("content") as `entrypoints/content.ts` and fails WXT's
    // duplicate-entrypoint-name check during `wxt build`. Drop *.test.ts(x)
    // files from entrypoint discovery; vitest still finds and runs them via
    // its own independent glob.
    'entrypoints:found': (_wxt, infos) => {
      for (let i = infos.length - 1; i >= 0; i--) {
        if (/\.test\.tsx?$/.test(infos[i].inputPath)) infos.splice(i, 1);
      }
    },
  },
  manifest: {
    name: 'TabTune',
    description: 'Per-tab audio control: auto-detect, mute, and fine volume per site. 100% local.',
    permissions: ['tabs', 'storage', 'scripting'],
    optional_host_permissions: ['*://*/*'],
    action: {
      default_title: 'TabTune',
      // NOTE: Chromium falls back to `icons` when this is missing; declared explicitly so
      // the store-reviewed manifest states the toolbar icon instead of relying on it.
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png' },
    },
    commands: {
      'toggle-mute-active': {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Mute/unmute the active tab',
      },
    },
  },
});
