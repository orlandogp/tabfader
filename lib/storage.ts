import { storage } from '#imports';
import type { SitePref } from './types';
import { clampVolume, DEFAULT_VOLUME } from './volume';

function siteItem(origin: string) {
  return storage.defineItem<SitePref | null>(`local:site:${origin}`, {
    fallback: null,
  });
}

/** The volume the user chose for `origin`, or null if they never chose one. */
export async function getSitePref(origin: string): Promise<SitePref | null> {
  const pref = await siteItem(origin).getValue();
  return pref ? { volume: clampVolume(pref.volume) } : null;
}

export async function getSiteVolume(origin: string): Promise<number> {
  return (await getSitePref(origin))?.volume ?? DEFAULT_VOLUME;
}

export async function setSiteVolume(origin: string, volume: number): Promise<void> {
  await siteItem(origin).setValue({ volume: clampVolume(volume) });
}
