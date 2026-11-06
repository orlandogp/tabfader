import type { Page } from '@playwright/test';
import { test, expect, media } from './fixtures';

const row = (popup: Page, title: string) => popup.locator('.tab-row', { hasText: title });

// NOTE: review bug (2026-11-06): granting a site forced its media to the 100% default before the
// user ever touched the slider.
test('granted site without a preference keeps the page volume', async ({ ext, site }) => {
  // NOTE: The content script announces itself (tabfader:alive) only AFTER it applied its stored
  // decision, so once seen, "did nothing" is a real observation, not an early look.
  await ext.context.addInitScript(() => {
    document.addEventListener('tabfader:alive', () => {
      (window as unknown as { __tabfaderAlive: boolean }).__tabfaderAlive = true;
    });
  });
  const page = await ext.openPlaying(site.granted('Own volume', { vol: '0.5' }));
  await page.waitForFunction(() => (window as unknown as { __tabfaderAlive?: boolean }).__tabfaderAlive === true);

  expect(await media(page).volume()).toBe(0.5);
});

// NOTE: review bug (2026-11-06): players that reuse one element (YouTube) re-assign .volume on
// each new video, silently undoing the user's choice.
test('a page override is re-enforced to the chosen volume', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Override'));
  const popup = await ext.openPopup();
  await row(popup, 'Override').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await media(page).setVolume(1);

  await expect.poll(() => media(page).volume()).toBe(0.3);
});

test('a media element added later gets the site volume', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Late player'));
  const popup = await ext.openPopup();
  await row(popup, 'Late player').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await page.evaluate(() => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<audio id="late" src="./tone.wav"></audio>';
    document.body.appendChild(wrapper);
  });

  await expect
    .poll(() => page.evaluate(() => (document.getElementById('late') as HTMLAudioElement).volume))
    .toBe(0.3);
});
