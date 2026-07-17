import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleMessage } from './background';

describe('handleMessage', () => {
  it('list returns audible tabs', async () => {
    // NOTE (resolution 2): fakeBrowser methods are plain functions, not vitest mocks —
    // `.mockImplementation` doesn't exist on them. Assign a `vi.fn()` directly instead
    // (established in Tasks 6-8, e.g. lib/audible-tabs.test.ts).
    fakeBrowser.tabs.query = vi.fn(async () => [
      { id: 3, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]) as any;
    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 3, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false },
    ]);
  });

  it('toggleMute mutes the tab', async () => {
    // NOTE (resolution 4): fake-browser's tabs.update doesn't persist mutedInfo (it
    // spreads `muted` as a stray top-level prop, not nested under mutedInfo), so
    // reading it back via tabs.get is not a reliable assertion. Spy on tabs.update
    // instead and assert the call shape, per Task 6's established pattern.
    fakeBrowser.tabs.update = vi.fn() as any;
    await handleMessage({ type: 'toggleMute', tabId: 5, muted: true }, {} as any);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(5, { muted: true });
  });

  it('setVolume persists the volume and messages the tab', async () => {
    // NOTE (resolution 5): vi.spyOn(fakeBrowser.tabs, 'sendMessage') fails because
    // fakeBrowser.tabs isn't a real method container to spy on — assign a vi.fn()
    // directly instead.
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await handleMessage({ type: 'setVolume', tabId: 9, origin: 'a.com', volume: 0.5 }, {} as any);
    const { getSiteVolume } = await import('@/lib/storage');
    expect(await getSiteVolume('a.com')).toBe(0.5);
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(9, { type: 'applyVolume', volume: 0.5 });
  });

  it('grantSite requests permission and reports the result', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => true) as any;
    // NOTE (resolution 3): @webext-core/fake-browser has no `scripting` namespace at
    // all (confirmed: no `scripting` in its typings), so it must be created before
    // its methods can be assigned.
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    const res = await handleMessage({ type: 'grantSite', tabId: 9, origin: 'a.com' }, {} as any);
    expect(res).toEqual({ granted: true });
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins: ['*://a.com/*'] });
    expect((fakeBrowser as any).scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: 'tabtune-a.com',
        js: ['content-scripts/content.js'],
        matches: ['*://a.com/*'],
        runAt: 'document_start',
        allFrames: true,
      },
    ]);
    expect((fakeBrowser as any).scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 9, allFrames: true },
      files: ['content-scripts/content.js'],
    });
  });

  it('grantSite does not register scripts when permission is denied', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => false) as any;
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    const res = await handleMessage({ type: 'grantSite', tabId: 9, origin: 'a.com' }, {} as any);
    expect(res).toEqual({ granted: false });
    expect((fakeBrowser as any).scripting.registerContentScripts).not.toHaveBeenCalled();
    expect((fakeBrowser as any).scripting.executeScript).not.toHaveBeenCalled();
  });
});
