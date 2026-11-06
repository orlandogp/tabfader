import type { Page } from '@playwright/test';
import { test, expect, media } from './fixtures';

// NOTE: `.tab-row` only SCOPES a row by its title; every interaction inside it goes
// through accessible roles/names, which is the contract users (and screen readers) rely on.
const row = (popup: Page, title: string) => popup.locator('.tab-row', { hasText: title });
// Row mute buttons are named after their tab ("Mute Lofi radio"); the row already scopes them.
const MUTE = /^Mute /;
const UNMUTE = /^Unmute /;
const MUTE_ALL = /(^|\s)Mute all$/;
const UNMUTE_ALL = /(^|\s)Unmute all$/;

test('a playing tab appears in an already-open popup without reloading it', async ({ ext, site }) => {
  const popup = await ext.openPopup();
  await expect(popup.getByText('Nothing is playing right now.')).toBeVisible();

  await ext.openPlaying(site.granted('Lofi radio'));

  await expect(row(popup, 'Lofi radio')).toBeVisible();
});

test('row mute button really mutes the tab and unmuting restores it', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Lofi radio'));
  const popup = await ext.openPopup();
  const lofi = row(popup, 'Lofi radio');

  await lofi.getByRole('button', { name: MUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);
  await expect(lofi.getByRole('button', { name: UNMUTE })).toBeVisible();

  await lofi.getByRole('button', { name: UNMUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(false);
  await expect(lofi.getByRole('button', { name: MUTE })).toBeVisible();
});

test('Mute all mutes every audible tab in the browser', async ({ ext, site }) => {
  const a = await ext.openPlaying(site.granted('Tab A'));
  const b = await ext.openPlaying(site.ungranted('Tab B'));
  const popup = await ext.openPopup();
  await expect(row(popup, 'Tab A')).toBeVisible();
  await expect(row(popup, 'Tab B')).toBeVisible();

  await popup.getByRole('button', { name: MUTE_ALL }).click();

  await expect.poll(async () => (await ext.tabState(a)).muted).toBe(true);
  await expect.poll(async () => (await ext.tabState(b)).muted).toBe(true);
  await expect(popup.getByRole('button', { name: UNMUTE_ALL })).toBeVisible();
});

// FIELD BUG (2026-11-06): Chrome clears `audible` ~2.5s after a tab goes quiet, muted
// or not, so a muted tab whose site stopped playing vanished and could not be unmuted.
test('a muted tab stays listed after its audio stops and can be unmuted from the popup', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Muted then paused'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Muted then paused');
  await r.getByRole('button', { name: MUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);

  await media(page).pause();
  await ext.waitAudible(page, false);

  // Reopen too: the fix must not depend on the popup having seen the tab before.
  const fresh = await ext.openPopup();
  for (const p of [popup, fresh]) await expect(row(p, 'Muted then paused')).toBeVisible();
  await row(fresh, 'Muted then paused').getByRole('button', { name: UNMUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(false);
});

test('Unmute all reaches a muted tab that went silent', async ({ ext, site }) => {
  const quiet = await ext.openPlaying(site.granted('Quiet one'));
  const loud = await ext.openPlaying(site.granted('Loud one'));
  const popup = await ext.openPopup();
  await popup.getByRole('button', { name: MUTE_ALL }).click();
  await expect.poll(async () => (await ext.tabState(quiet)).muted).toBe(true);
  await media(quiet).pause();
  await ext.waitAudible(quiet, false);

  await popup.getByRole('button', { name: UNMUTE_ALL }).click();

  await expect.poll(async () => (await ext.tabState(quiet)).muted).toBe(false);
  await expect.poll(async () => (await ext.tabState(loud)).muted).toBe(false);
});

test('the footer links to the source repository from the manifest', async ({ ext }) => {
  const popup = await ext.openPopup();
  await expect(popup.getByRole('link', { name: /open source/i })).toHaveAttribute(
    'href',
    'https://github.com/orlandogp/tabfader',
  );
});

test('ungranted site shows the opt-in button and still mutes', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.ungranted('Not granted'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Not granted');

  await expect(r.getByRole('button', { name: /control volume here/i })).toBeVisible();
  await expect(r.getByRole('slider')).toHaveCount(0);

  await r.getByRole('button', { name: MUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);
});

test('slider sets the real media volume', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Volume'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Volume');

  await r.getByRole('slider', { name: 'Volume' }).fill('30');

  await expect.poll(() => media(page).volume()).toBe(0.3);
  await expect(r.getByText('30%')).toBeVisible();
});

test('slider volume reaches every tab of the same site', async ({ ext, site }) => {
  const one = await ext.openPlaying(site.granted('Site tab one'));
  const two = await ext.openPlaying(site.granted('Site tab two'));
  const popup = await ext.openPopup();

  await row(popup, 'Site tab one').getByRole('slider', { name: 'Volume' }).fill('30');

  await expect.poll(() => media(one).volume()).toBe(0.3);
  await expect.poll(() => media(two).volume()).toBe(0.3);
  // Both rows share the site's volume, so both sliders say so.
  await expect(row(popup, 'Site tab two').getByText('30%')).toBeVisible();
});

test('mute + volume change + unmute keeps the volume and clears the mute', async ({ ext, site }) => {
  const page = await ext.openPlaying(site.granted('Combo'));
  const popup = await ext.openPopup();
  const r = row(popup, 'Combo');

  await r.getByRole('button', { name: MUTE }).click();
  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(true);
  await r.getByRole('slider', { name: 'Volume' }).fill('30');
  await r.getByRole('button', { name: UNMUTE }).click();

  await expect.poll(async () => (await ext.tabState(page)).muted).toBe(false);
  await expect.poll(() => media(page).volume()).toBe(0.3);
});
