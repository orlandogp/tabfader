import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';
import { originKeyFromUrl } from './origin';

/** Maps a browser tab to the popup's view model; null for tabs TabFader can't control. */
export function toAudibleTab(tab: chrome.tabs.Tab): AudibleTab | null {
  if (tab.id == null || !tab.url) return null;
  const origin = originKeyFromUrl(tab.url);
  if (!origin) return null;
  return {
    id: tab.id,
    title: tab.title ?? origin,
    url: tab.url,
    origin,
    favIconUrl: tab.favIconUrl,
    muted: tab.mutedInfo?.muted ?? false,
    audible: tab.audible ?? false,
  };
}

export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  await browser.tabs.update(tabId, { muted });
}
