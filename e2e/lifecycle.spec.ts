import type { Page } from '@playwright/test';
import { test, expect, media } from './fixtures';

const row = (popup: Page, title: string) => popup.locator('.tab-row', { hasText: title });
// Row mute buttons are named after their tab ("Mute Lofi radio"); the row already scopes them.
const MUTE = /^Mute /;
const UNMUTE = /^Unmute /;

test('closing the tab removes its row; reopening the page brings it back', async ({ ext, site }) => {
  const url = site.granted('Comes and goes');
  const page = await ext.openPlaying(url);
  const popup = await ext.openPopup();
  await expect(row(popup, 'Comes and goes')).toBeVisible();

  await page.close();
  await expect(row(popup, 'Comes and goes')).toHaveCount(0);

  await ext.openPlaying(url);
  await expect(row(popup, 'Comes and goes')).toBeVisible();
});

/** Counts `.tab-row` elements the popup removes from its DOM from now on. */
async function countRowUnmounts(popup: Page): Promise<() => Promise<number>> {
  await popup.evaluate(() => {
    const w = window as unknown as { __rowUnmounts: number };
    w.__rowUnmounts = 0;
    new MutationObserver((records) => {
      for (const r of records)
        r.removedNodes.forEach((n) => {
          if (n instanceof Element && n.matches('.tab-row')) w.__rowUnmounts++;
        });
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => popup.evaluate(() => (window as unknown as { __rowUnmounts: number }).__rowUnmounts);
}

// FIELD BUG (2026-11-06): a site with intermittent sound made its row vanish ~2.5s into
// every silence and come back with the next sound: the popup blinked while open.
test('a row never unmounts while its audio pauses and resumes', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Intermittent'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Intermittent');
  await expect(r).toBeVisible();
  const unmounts = await countRowUnmounts(popup);

  await media(page).pause();
  await ext.waitAudible(page, false);
  await expect(r).toContainText('silent');
  await media(page).play();
  await ext.waitAudible(page, true);
  await expect(r).not.toContainText('silent');

  expect(await unmounts()).toBe(0);
});

test('the silent row leaves only when its tab is closed', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Quiet then closed'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Quiet then closed');
  await media(page).pause();
  await ext.waitAudible(page, false);
  await expect(r).toContainText('silent');

  await page.close();

  await expect(r).toHaveCount(0);
});

test('closing and reopening the popup shows the same muted state', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Sticky mute'));
  const first = await ext.openPopup();
  await row(first, 'Sticky mute').getByRole('button', { name: MUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);
  await first.close();

  const second = await ext.openPopup();
  const r = row(second, 'Sticky mute');
  await expect(r.getByRole('button', { name: UNMUTE })).toBeVisible();
  await expect(r).toContainText('muted');
});

test('volume survives a page reload', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Reloaded'));
  const popup = await ext.openPopup();
  await row(popup, 'Reloaded').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await page.reload();

  await expect.poll(() => media(page).volume()).toBe(0.3);
});

test('volume survives an extension reload and the slider still works after it', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Updated'));
  const popup = await ext.openPopup();
  await row(popup, 'Updated').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await ext.reloadExtension();

  // The page must not snap back to its default while the old script is orphaned.
  await expect.poll(() => media(page).volume()).toBe(0.3);
  const fresh = await ext.openPopup();
  await row(fresh, 'Updated').getByRole('slider', { name: 'Volume' }).fill('60');
  await expect.poll(() => media(page).volume()).toBe(0.6);
});

test('volume survives a full browser restart', async ({ ext, site }) => {
  test.setTimeout(90_000);
  const url = site.granted('Restarted');
  const page = await ext.openPlaying(url);
  const popup = await ext.openPopup();
  await row(popup, 'Restarted').getByRole('slider', { name: 'Volume' }).fill('30');
  await expect.poll(() => media(page).volume()).toBe(0.3);

  await ext.relaunch();

  const reopened = await ext.context.newPage();
  await reopened.goto(url);
  await expect.poll(() => media(reopened).volume()).toBe(0.3);
});
