import type { Page } from '@playwright/test';
import { test, expect, media } from './fixtures';

const row = (popup: Page, title: string) => popup.locator('.tab-row', { hasText: title });

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

test('closing and reopening the popup shows the same muted state', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Sticky mute'));
  const first = await ext.openPopup();
  await row(first, 'Sticky mute').getByRole('button', { name: 'Mute', exact: true }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);
  await first.close();

  const second = await ext.openPopup();
  const r = row(second, 'Sticky mute');
  await expect(r.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
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
