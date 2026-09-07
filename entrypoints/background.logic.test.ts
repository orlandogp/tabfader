import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleMessage, reregisterGrantedOrigins, handlePermissionsAdded } from './background';

describe('handleMessage', () => {
  it('list returns audible tabs', async () => {
    // NOTE (resolution 2): fakeBrowser methods are plain functions, not vitest mocks —
    // `.mockImplementation` doesn't exist on them. Assign a `vi.fn()` directly instead
    // (established in Tasks 6-8, e.g. lib/audible-tabs.test.ts).
    // fake-browser has no permissions.getAll implementation — the list handler
    // sweeps granted origins for zero-volume sites, so stub it empty here.
    fakeBrowser.permissions.getAll = vi.fn(async () => ({ origins: [], permissions: [] })) as any;
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
    fakeBrowser.permissions.getAll = vi.fn(async () => ({
      origins: ['*://a.com/*'],
      permissions: [],
    })) as any;
    fakeBrowser.tabs.query = vi.fn(async (q: any) =>
      q?.audible ? [] : [{ id: 7, url: 'https://a.com/x', title: 'A', mutedInfo: { muted: false } } as chrome.tabs.Tab],
    ) as any;

    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([
      { id: 7, title: 'A', url: 'https://a.com/x', origin: 'a.com', favIconUrl: undefined, muted: false },
    ]);
    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({ url: '*://a.com/*' });
  });

  it('does not force-list the origin once its volume is above 0', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0.5);
    fakeBrowser.permissions.getAll = vi.fn(async () => ({
      origins: ['*://a.com/*'],
      permissions: [],
    })) as any;
    fakeBrowser.tabs.query = vi.fn(async () => []) as any;

    const res = await handleMessage({ type: 'list' }, {} as any);
    expect(res).toEqual([]);
    // only the audible query ran — no per-origin tab sweep
    expect(fakeBrowser.tabs.query).toHaveBeenCalledTimes(1);
  });

  it('returns a stable order (by tab id) regardless of audible/zeroed category', async () => {
    // FIELD BUG (round 5): rows jumped between the audible block and the
    // appended zero-volume block while dragging the slider (audible flips
    // live), making the knob move under the cursor. Order must be stable and
    // category-independent: tab creation order (id).
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    fakeBrowser.permissions.getAll = vi.fn(async () => ({
      origins: ['*://a.com/*'],
      permissions: [],
    })) as any;
    fakeBrowser.tabs.query = vi.fn(async (q: any) =>
      q?.audible
        ? [{ id: 9, url: 'https://b.com/y', title: 'B', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab]
        : [{ id: 3, url: 'https://a.com/x', title: 'A', mutedInfo: { muted: false } } as chrome.tabs.Tab],
    ) as any;

    const res = (await handleMessage({ type: 'list' }, {} as any)) as Array<{ id: number }>;
    // the zeroed a.com tab (id 3) was created before the audible b.com tab
    // (id 9), so it must come FIRST even though it is not audible.
    expect(res.map((t) => t.id)).toEqual([3, 9]);
  });

  it('does not duplicate a tab that is both audible and on a zeroed origin', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('a.com', 0);
    fakeBrowser.permissions.getAll = vi.fn(async () => ({
      origins: ['*://a.com/*'],
      permissions: [],
    })) as any;
    fakeBrowser.tabs.query = vi.fn(async (q: any) => [
      { id: 7, url: 'https://a.com/x', title: 'A', audible: true, mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]) as any;

    const res = (await handleMessage({ type: 'list' }, {} as any)) as unknown[];
    expect(res).toHaveLength(1);
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
