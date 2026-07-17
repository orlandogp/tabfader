import { test, expect } from './fixtures';

test('popup lists the audible tab and mutes it', async ({ context, extensionId, mediaPageUrl }) => {
  const page = await context.newPage();
  await page.goto(mediaPageUrl);

  // Make sure the page is actually producing sound before we go looking for
  // it in the extension's audible-tabs list — `tab.audible` in Chrome has
  // ~seconds-level granularity and only flips once real playback starts.
  await page.waitForFunction(() => {
    const el = document.getElementById('a') as HTMLAudioElement | null;
    return !!el && !el.paused && el.currentTime > 0;
  });

  const popup = await context.newPage();

  // The popup only queries `chrome.tabs.query({ audible: true })` once, on
  // mount (see entrypoints/popup/App.tsx `useEffect(() => { refresh(); }, [])`),
  // so we poll by reloading the popup page until the audible tab's row
  // shows up, bounded by a timeout, rather than waiting on a single load.
  const row = popup.locator('.tab-row');
  const deadline = Date.now() + 20_000;
  let listed = false;
  while (Date.now() < deadline) {
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    listed = (await row.count()) > 0;
    if (listed) break;
    await popup.waitForTimeout(500);
  }
  expect(listed, 'expected the audible media tab to appear in the popup list').toBe(true);

  // The audible page should appear in the list; mute button toggles.
  await expect(popup.getByRole('button', { name: /mute all/i })).toBeVisible();
  await popup.getByRole('button', { name: /mute all/i }).click();

  // Verify the media tab reports muted via the extension state.
  await expect(popup.getByText(/muted/i)).toBeVisible({ timeout: 5000 });
});
