import type { BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';

// The popup follows the browser theme by declaring `color-scheme: light dark` and painting
// its own background with the system Canvas color. The light-first fallback for browsers
// without a readable preference cannot be emulated here; entrypoints/popup/style.test.ts pins it.
async function popupBackgroundLuminance(context: BrowserContext, extensionId: string) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const color = await popup.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const match = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(color);
  if (!match) throw new Error(`unexpected background color: ${color}`);
  const [, r, g, b, alpha] = match;
  if (alpha !== undefined && Number(alpha) === 0) throw new Error(`popup body paints no background (${color})`);
  return (0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)) / 255;
}

test.describe('dark browser theme', () => {
  test.use({ colorScheme: 'dark' });
  test('popup paints a dark background', async ({ context, extensionId }) => {
    expect(await popupBackgroundLuminance(context, extensionId)).toBeLessThan(0.25);
  });
});

test.describe('light browser theme', () => {
  test.use({ colorScheme: 'light' });
  test('popup paints a light background', async ({ context, extensionId }) => {
    expect(await popupBackgroundLuminance(context, extensionId)).toBeGreaterThan(0.75);
  });
});
