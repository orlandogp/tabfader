import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';
import { originKeyFromUrl } from './origin';

export async function queryAudibleTabs(): Promise<AudibleTab[]> {
  const tabs = await browser.tabs.query({ audible: true });
  const result: AudibleTab[] = [];
  for (const tab of tabs) {
    if (tab.id == null || !tab.url) continue;
    const origin = originKeyFromUrl(tab.url);
    if (!origin) continue;
    result.push({
      id: tab.id,
      title: tab.title ?? origin,
      url: tab.url,
      origin,
      favIconUrl: tab.favIconUrl,
      muted: tab.mutedInfo?.muted ?? false,
    });
  }
  return result;
}

export async function setTabMuted(tabId: number, muted: boolean): Promise<void> {
  await browser.tabs.update(tabId, { muted });
}
