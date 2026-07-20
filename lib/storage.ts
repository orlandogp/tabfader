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

// Tabs whose volume TabTune itself dragged to 0: they stop being `audible`, so
// the popup list would drop them and the user would lose the slider needed to
// bring the sound back. Session-scoped (tab ids aren't stable across browser
// restarts): tabId -> origin.
const zeroedTabsItem = storage.defineItem<Record<string, string>>('session:zeroedTabs', {
  fallback: {},
});

export async function setTabZeroed(tabId: number, origin: string, zeroed: boolean): Promise<void> {
  const map = { ...(await zeroedTabsItem.getValue()) };
  if (zeroed) map[String(tabId)] = origin;
  else delete map[String(tabId)];
  await zeroedTabsItem.setValue(map);
}

export async function getZeroedTabs(): Promise<Record<string, string>> {
  return zeroedTabsItem.getValue();
}
