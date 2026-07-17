import { storage } from '#imports';
import type { SitePref, Settings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { clampVolume, DEFAULT_VOLUME } from './volume';

const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

function siteItem(origin: string) {
  return storage.defineItem<SitePref | null>(`local:site:${origin}`, {
    fallback: null,
  });
}

export async function getSiteVolume(origin: string): Promise<number> {
  const pref = await siteItem(origin).getValue();
  return pref ? clampVolume(pref.volume) : DEFAULT_VOLUME;
}

export async function setSiteVolume(origin: string, volume: number): Promise<void> {
  await siteItem(origin).setValue({ volume: clampVolume(volume) });
}

export async function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  const current = await settingsItem.getValue();
  await settingsItem.setValue({ ...current, ...patch });
}
