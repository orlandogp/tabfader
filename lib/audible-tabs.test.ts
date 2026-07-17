import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { queryAudibleTabs, setTabMuted } from './audible-tabs';

describe('queryAudibleTabs', () => {
  it('returns supported audible tabs mapped to the view model', async () => {
    fakeBrowser.tabs.query = vi.fn(async () => [
      {
        id: 1,
        url: 'https://www.youtube.com/watch?v=x',
        title: 'Lofi',
        audible: true,
        mutedInfo: { muted: false },
        favIconUrl: 'f',
      } as chrome.tabs.Tab,
    ]) as any;

    const tabs = await queryAudibleTabs();
    expect(tabs).toEqual([
      { id: 1, title: 'Lofi', url: 'https://www.youtube.com/watch?v=x', origin: 'www.youtube.com', favIconUrl: 'f', muted: false },
    ]);
  });

  it('filters out unsupported URLs (chrome://)', async () => {
    fakeBrowser.tabs.query = vi.fn(async () => [
      { id: 1, url: 'chrome://extensions', title: 'x', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]) as any;
    expect(await queryAudibleTabs()).toEqual([]);
  });
});

describe('setTabMuted', () => {
  it('calls tabs.update with the muted flag', async () => {
    fakeBrowser.tabs.update = vi.fn() as any;
    await setTabMuted(7, true);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(7, { muted: true });
  });
});
