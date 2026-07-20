import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleMessage, reregisterGrantedOrigins, handlePermissionsAdded } from './background';

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

  it('muteAll applies the requested muted state to every audible tab', async () => {
    fakeBrowser.tabs.query = vi.fn(async () => [
      { id: 1, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: true } } as chrome.tabs.Tab,
      { id: 2, url: 'https://b.com/y', title: 'B', audible: true, mutedInfo: { muted: true } } as chrome.tabs.Tab,
    ]) as any;
    fakeBrowser.tabs.update = vi.fn() as any;
    // toggle semantics: the popup decides the target state; false = unmute all
    await handleMessage({ type: 'muteAll', muted: false }, {} as any);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(1, { muted: false });
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(2, { muted: false });
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

  it('grantSite confirms the already-granted permission and reports the result', async () => {
    // NOTE: the handler now checks with `permissions.contains` instead of
    // (re-)requesting — the popup already requested it under the click gesture,
    // and re-requesting from the service worker has no gesture to point to.
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
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
    expect(fakeBrowser.permissions.contains).toHaveBeenCalledWith({ origins: ['*://a.com/*'] });
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

  it('grantSite does not register scripts when permission is not granted', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => false) as any;
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

describe('zero-volume tabs stay listed', () => {
  // FIELD BUG: dragging a site to 0% makes the tab non-audible, so it vanished
  // from the list and the user had no slider left to raise it back. Tabs WE
  // silenced must stay listed until the volume comes back up or the tab closes.
  it('keeps a tab we zeroed in the list even when no longer audible', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await handleMessage({ type: 'setVolume', tabId: 7, origin: 'a.com', volume: 0 }, {} as any);

    fakeBrowser.tabs.query = vi.fn(async () => []) as any; // nothing audible anymore
    fakeBrowser.tabs.get = vi.fn(async () => ({
      id: 7, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false },
    } as chrome.tabs.Tab)) as any;

    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 7, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false },
    ]);
  });

  it('stops force-listing the tab once volume is raised again', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await handleMessage({ type: 'setVolume', tabId: 7, origin: 'a.com', volume: 0 }, {} as any);
    await handleMessage({ type: 'setVolume', tabId: 7, origin: 'a.com', volume: 0.5 }, {} as any);

    fakeBrowser.tabs.query = vi.fn(async () => []) as any;
    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([]);
  });

  it('drops zeroed tabs that were closed or navigated away', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await handleMessage({ type: 'setVolume', tabId: 7, origin: 'a.com', volume: 0 }, {} as any);

    fakeBrowser.tabs.query = vi.fn(async () => []) as any;
    fakeBrowser.tabs.get = vi.fn(async () => { throw new Error('No tab with id: 7'); }) as any;

    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([]);
  });
});

describe('handlePermissionsAdded', () => {
  // ROOT CAUSE (field-confirmed): the native permission prompt steals focus and
  // CLOSES the popup, killing its JS — so the popup code after
  // `await requestOriginPermission(...)` (sending grantSite -> register+inject)
  // never runs. The permission itself still gets granted at browser level.
  // The background must therefore self-converge on `permissions.onAdded`:
  // register the origin script AND inject into already-open matching tabs.
  it('registers the origin script and injects into open matching tabs', async () => {
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    fakeBrowser.tabs.query = vi.fn(async () => [
      { id: 42, url: 'https://a.com/watch' } as chrome.tabs.Tab,
    ]) as any;

    await handlePermissionsAdded({ origins: ['*://a.com/*'], permissions: [] });

    expect((fakeBrowser as any).scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: 'tabtune-a.com',
        js: ['content-scripts/content.js'],
        matches: ['*://a.com/*'],
        runAt: 'document_start',
        allFrames: true,
      },
    ]);
    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({ url: '*://a.com/*' });
    expect((fakeBrowser as any).scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42, allFrames: true },
      files: ['content-scripts/content.js'],
    });
  });

  it('does nothing when the added permission has no origins', async () => {
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    await handlePermissionsAdded({ permissions: ['tabs'] });
    expect((fakeBrowser as any).scripting.registerContentScripts).not.toHaveBeenCalled();
  });
});

describe('reregisterGrantedOrigins', () => {
  it('re-registers a content script for every already-granted origin', async () => {
    // Simulates an extension update / browser restart: registrations
    // (scripting.registerContentScripts) are lost but the granted host
    // permissions survive, so onInstalled must rebuild the registrations from
    // `permissions.getAll`.
    fakeBrowser.permissions.getAll = vi.fn(async () => ({
      origins: ['*://youtube.com/*'],
      permissions: [],
    })) as any;
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    await reregisterGrantedOrigins();
    expect((fakeBrowser as any).scripting.registerContentScripts).toHaveBeenCalledWith([
      {
        id: 'tabtune-youtube.com',
        js: ['content-scripts/content.js'],
        matches: ['*://youtube.com/*'],
        runAt: 'document_start',
        allFrames: true,
      },
    ]);
  });
});
