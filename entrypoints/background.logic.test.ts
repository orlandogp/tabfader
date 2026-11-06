import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleMessage, reregisterGrantedOrigins, handlePermissionsAdded } from './background';

// NOTE: fakeBrowser methods are plain functions, not vitest mocks — assign a `vi.fn()`
// directly. fake-browser has no permissions.getAll, so every list test stubs it.
function openTabs(tabs: Partial<chrome.tabs.Tab>[], grantedOrigins: string[] = []) {
  fakeBrowser.tabs.query = vi.fn(async () => tabs as chrome.tabs.Tab[]) as any;
  fakeBrowser.permissions.getAll = vi.fn(async () => ({ origins: grantedOrigins, permissions: [] })) as any;
  fakeBrowser.tabs.update = vi.fn() as any;
}

describe('list', () => {
  it('returns an audible tab with its flags', async () => {
    openTabs([{ id: 3, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } }]);
    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 3, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false, audible: true },
    ]);
  });

  // FIELD BUG (2026-11-06): Chrome clears `audible` ~2.5s after a tab stops producing
  // sound, muted or not. A muted tab whose site went quiet vanished from the list and
  // could only be unmuted from the tab itself.
  it('includes a muted tab that is no longer audible', async () => {
    openTabs([{ id: 4, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: true } }]);
    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 4, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: true, audible: false },
    ]);
  });

  it('leaves out a silent, unmuted tab', async () => {
    openTabs([{ id: 5, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } }]);
    expect(await handleMessage({ type: 'list' }, {} as any)).toEqual([]);
  });

  // The open popup asks to `keep` the rows it already shows, so a tab that goes quiet
  // stays put instead of flickering out and back in with intermittent audio.
  it('keeps a requested tab that went silent', async () => {
    openTabs([{ id: 5, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } }]);
    const res = await handleMessage({ type: 'list', keep: [5] }, {} as any);
    expect(res).toEqual([
      { id: 5, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false, audible: false },
    ]);
  });

  it('ignores kept ids that no longer exist', async () => {
    openTabs([{ id: 1, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } }]);
    const res = (await handleMessage({ type: 'list', keep: [99] }, {} as any)) as Array<{ id: number }>;
    expect(res.map((t) => t.id)).toEqual([1]);
  });

  it('keeps a kept tab that navigated, with its new origin', async () => {
    openTabs([{ id: 5, url: 'https://b.com/new', title: 'New page', audible: false, mutedInfo: { muted: false } }]);
    const res = await handleMessage({ type: 'list', keep: [5] }, {} as any);
    expect(res).toEqual([
      expect.objectContaining({ id: 5, origin: 'b.com', title: 'New page' }),
    ]);
  });

  it('drops a kept tab that navigated to an unsupported page', async () => {
    openTabs([{ id: 5, url: 'chrome://newtab', title: 'New Tab', audible: false, mutedInfo: { muted: false } }]);
    expect(await handleMessage({ type: 'list', keep: [5] }, {} as any)).toEqual([]);
  });

  it('leaves out a muted tab on an unsupported page', async () => {
    openTabs([{ id: 6, url: 'chrome://settings', title: 'S', audible: false, mutedInfo: { muted: true } }]);
    expect(await handleMessage({ type: 'list' }, {} as any)).toEqual([]);
  });
});

describe('muteAll', () => {
  it('unmutes a muted tab that has gone silent', async () => {
    openTabs([
      { id: 1, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: true } },
      { id: 4, url: 'https://b.com/y', title: 'B', audible: false, mutedInfo: { muted: true } },
    ]);
    await handleMessage({ type: 'muteAll', muted: false }, {} as any);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(1, { muted: false });
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(4, { muted: false });
  });

  it('never touches a silent, unmuted tab that is not listed', async () => {
    openTabs([
      { id: 1, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } },
      { id: 5, url: 'https://b.com/y', title: 'B', audible: false, mutedInfo: { muted: false } },
    ]);
    await handleMessage({ type: 'muteAll', muted: true }, {} as any);
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(1, { muted: true });
    expect(fakeBrowser.tabs.update).not.toHaveBeenCalledWith(5, expect.anything());
  });
});

describe('handleMessage', () => {

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
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    await handleMessage({ type: 'setVolume', tabId: 9, origin: 'a.com', volume: 0.5 }, {} as any);
    const { getSiteVolume } = await import('@/lib/storage');
    expect(await getSiteVolume('a.com')).toBe(0.5);
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(9, { type: 'applyVolume', volume: 0.5 });
    // delivery succeeded -> no need to re-inject
    expect((fakeBrowser as any).scripting.executeScript).not.toHaveBeenCalled();
  });

  it('setVolume re-injects the content script when delivery fails', async () => {
    // FIELD BUG (round 4): extension reloads/updates ORPHAN injected content
    // scripts — their message listener dies, so applyVolume was silently
    // swallowed while storage said "all good". Delivery must be verified and
    // recovered: on failure, inject the script now (we hold the permission);
    // the fresh script applies the just-stored volume on startup.
    fakeBrowser.tabs.sendMessage = vi.fn(async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }) as any;
    (fakeBrowser as any).scripting = {
      registerContentScripts: vi.fn(async () => undefined),
      unregisterContentScripts: vi.fn(async () => undefined),
      executeScript: vi.fn(async () => [] as any),
    };
    await handleMessage({ type: 'setVolume', tabId: 9, origin: 'a.com', volume: 1 }, {} as any);
    const { getSiteVolume } = await import('@/lib/storage');
    expect(await getSiteVolume('a.com')).toBe(1);
    expect((fakeBrowser as any).scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 9, allFrames: true },
      files: ['content-scripts/content.js'],
    });
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
        id: 'tabfader-a.com',
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

describe('zero-volume origins stay listed', () => {
  // FIELD BUG (round 2): volume is stored PER ORIGIN, so a site left at 0%
  // silences every present and future tab of that origin — none of them ever
  // becomes `audible`, so none would be listed and there'd be no slider to
  // recover. The list must therefore include every open tab of any granted
  // origin whose stored volume is 0. Queried live from storage + permissions:
  // self-healing, needs no per-tab tracking or migration.
  it('lists open tabs of a granted origin stored at 0% even when silent', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    openTabs([{ id: 7, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } }], ['*://a.com/*']);

    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 7, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false, audible: false },
    ]);
  });

  it('does not force-list the origin once its volume is above 0', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0.5);
    openTabs([{ id: 7, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } }], ['*://a.com/*']);

    expect(await handleMessage({ type: 'list' }, {} as any)).toEqual([]);
  });

  it('does not force-list a 0% origin whose permission was revoked', async () => {
    // Without the permission the content script no longer silences the tab, so it is
    // just a quiet tab like any other.
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    openTabs([{ id: 7, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } }], []);

    expect(await handleMessage({ type: 'list' }, {} as any)).toEqual([]);
  });

  it('does not force-list a subdomain of a 0% origin', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    openTabs([{ id: 8, url: 'https://sub.a.com/x', title: 'S', audible: false, mutedInfo: { muted: false } }], ['*://a.com/*']);

    expect(await handleMessage({ type: 'list' }, {} as any)).toEqual([]);
  });

  it('returns a stable order (by tab id) regardless of audible/zeroed category', async () => {
    // FIELD BUG (round 5): rows jumped between the audible block and the
    // appended zero-volume block while dragging the slider (audible flips
    // live), making the knob move under the cursor. Order must be stable and
    // category-independent: tab creation order (id).
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    // tabs.query({}) does not promise any order; hand it the later tab first.
    openTabs(
      [
        { id: 9, url: 'https://b.com/y', title: 'B', audible: true, mutedInfo: { muted: false } },
        { id: 3, url: 'https://a.com/x', title: 'A', audible: false, mutedInfo: { muted: false } },
      ],
      ['*://a.com/*'],
    );

    const res = (await handleMessage({ type: 'list' }, {} as any)) as Array<{ id: number }>;
    // the zeroed a.com tab (id 3) was created before the audible b.com tab
    // (id 9), so it must come FIRST even though it is not audible.
    expect(res.map((t) => t.id)).toEqual([3, 9]);
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
        id: 'tabfader-a.com',
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
        id: 'tabfader-youtube.com',
        js: ['content-scripts/content.js'],
        matches: ['*://youtube.com/*'],
        runAt: 'document_start',
        allFrames: true,
      },
    ]);
  });
});
