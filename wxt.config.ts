import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

// NOTE: @wxt-dev/module-preact does not exist (WXT only ships official modules for
// React, Vue, Svelte, Solid). Per WXT's own docs, frameworks without a dedicated
// module are wired up via their Vite plugin directly.
export default defineConfig({
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'TabTune',
    description: 'Per-tab audio control: auto-detect, mute, and fine volume per site. 100% local.',
    permissions: ['tabs', 'storage', 'scripting'],
    optional_host_permissions: ['*://*/*'],
    action: { default_title: 'TabTune' },
  },
});
