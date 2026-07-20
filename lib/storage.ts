import { storage } from '#imports';
import type { SitePref } from './types';
import { clampVolume, DEFAULT_VOLUME } from './volume';

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
