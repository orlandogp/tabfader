import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { toAudibleTab, setTabMuted } from './audible-tabs';

describe('toAudibleTab', () => {
  it('maps a tab to the view model with its audible and muted flags', () => {
    const tab = {
      id: 1,
      url: 'https://www.youtube.com/watch?v=x',
      title: 'Lofi',
      audible: false,
      mutedInfo: { muted: true },
      favIconUrl: 'f',
    } as chrome.tabs.Tab;

    expect(toAudibleTab(tab)).toEqual({
      id: 1,
      title: 'Lofi',
      url: 'https://www.youtube.com/watch?v=x',
      origin: 'www.youtube.com',
      favIconUrl: 'f',
      muted: true,
      audible: false,
    });
  });

  it('falls back to the origin when the tab has no title yet', () => {
    const tab = { id: 2, url: 'https://a.com/x', audible: true } as chrome.tabs.Tab;
    expect(toAudibleTab(tab)).toMatchObject({ title: 'a.com', muted: false, audible: true });
  });

  it('rejects unsupported URLs (chrome://)', () => {
    expect(toAudibleTab({ id: 1, url: 'chrome://extensions', audible: true } as chrome.tabs.Tab)).toBeNull();
  });

  it('rejects tabs without an id or url', () => {
    expect(toAudibleTab({ url: 'https://a.com/' } as chrome.tabs.Tab)).toBeNull();
    expect(toAudibleTab({ id: 3 } as chrome.tabs.Tab)).toBeNull();
  });
});

describe('setTabMuted', () => {
  it('calls tabs.update with the muted flag', async () => {
    fakeBrowser.tabs.update = vi.fn() as any;
    await setTabMuted(7, true);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(7, { muted: true });
  });
});
