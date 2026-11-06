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

test('the popup shows the real volume of a granted site with no chosen volume', async ({ ext, site }) => {
  await ext.openPlaying(site.granted('Own level', { vol: '0.5' }));
  const popup = await ext.openPopup();
  const r = row(popup, 'Own level');

  await expect(r.getByRole('slider', { name: 'Volume' })).toHaveValue('50');
  await expect(r.getByText('50%')).toBeVisible();
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

// NOTE: review finding (2026-11-06): players built as web components keep their media in
// an open shadow root, out of reach of document-level queries and events.
test('a player inside an open shadow root follows and keeps the site volume', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Shadow player'));
  const popup = await ext.openPopup();
  await row(popup, 'Shadow player').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await page.evaluate(() => {
    const host = document.createElement('shadow-player');
    host.attachShadow({ mode: 'open' }).innerHTML = '<audio src="./tone.wav"></audio>';
    document.body.appendChild(host);
  });
  const shadowVolume = () =>
    page.evaluate(() => (document.querySelector('shadow-player')!.shadowRoot!.querySelector('audio') as HTMLAudioElement).volume);
  await expect.poll(shadowVolume).toBe(0.3);

  await page.evaluate(() => {
    (document.querySelector('shadow-player')!.shadowRoot!.querySelector('audio') as HTMLAudioElement).volume = 1;
  });
  await expect.poll(shadowVolume).toBe(0.3);
});
