import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/preact';
import { fakeBrowser } from 'wxt/testing';
import type { AudibleTab } from '@/lib/types';
import { App } from './App';

const LOFI: AudibleTab = { id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false, audible: true };
const NEWS: AudibleTab = { id: 2, title: 'News', url: 'https://news.com', origin: 'news.com', muted: false, audible: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** Each `list` call takes the next response; a function response is called with the message. */
function backgroundLists(...responses: Array<unknown | ((msg: any) => unknown)>) {
  let call = 0;
  fakeBrowser.runtime.sendMessage = vi.fn(async (msg: any) => {
    if (msg.type !== 'list') return undefined;
    const r = responses[Math.min(call++, responses.length - 1)];
    return typeof r === 'function' ? (r as (m: any) => unknown)(msg) : r;
  }) as any;
}

const listCalls = () =>
  (fakeBrowser.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.filter(([msg]: [any]) => msg.type === 'list');

const tabUpdated = () => act(() => fakeBrowser.tabs.onUpdated.trigger(1, { audible: false }, {} as chrome.tabs.Tab));

beforeEach(() => {
  backgroundLists([LOFI]);
  fakeBrowser.permissions.contains = vi.fn(async () => false) as any;
});

describe('App', () => {
  it('lists the tabs from the background', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => expect(screen.getByText('Lofi')).toBeTruthy());
    expect(screen.getByText('youtube.com')).toBeTruthy();
  });

  it('sends muteAll (muted: true) for the rows it shows when not every tab is muted', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/mute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: true, keep: [1] });
  });

  it('offers Unmute all (muted: false) when every tab is already muted', async () => {
    backgroundLists([{ ...LOFI, muted: true }]);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/unmute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: false, keep: [1] });
  });

  it('refreshes the tab list live when a tab changes while the popup is open', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    expect(listCalls()).toHaveLength(1);

    await tabUpdated();

    await waitFor(() => expect(listCalls()).toHaveLength(2));
  });

  it('asks the background to keep the rows it already shows', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await tabUpdated();

    await waitFor(() => expect(listCalls()[1][0]).toEqual({ type: 'list', keep: [1] }));
  });

  // NOTE: field bug (2026-11-06): rows rendered first and fetched their permission/volume after,
  // so a granted row flashed "Control volume here" at 100% on every (re)appearance.
  it('a newly listed granted row never flashes the opt-in button', async () => {
    const permission = deferred<boolean>();
    backgroundLists([], [LOFI]);
    fakeBrowser.permissions.contains = vi.fn(() => permission.promise) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Nothing is playing right now.'));

    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(screen.queryByText(/control volume here/i)).toBeNull();

    await act(async () => permission.resolve(true));
    await waitFor(() => screen.getByRole('slider'));
    expect(screen.queryByText(/control volume here/i)).toBeNull();
  });

  it('drops a stale list response that resolves after a newer one', async () => {
    const older = deferred<AudibleTab[]>();
    const newer = deferred<AudibleTab[]>();
    backgroundLists([LOFI], () => older.promise, () => newer.promise);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await tabUpdated();
    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(3));
    await act(async () => newer.resolve([LOFI, NEWS]));
    await waitFor(() => screen.getByText('News'));
    const permissionChecks = () => (fakeBrowser.permissions.contains as ReturnType<typeof vi.fn>).mock.calls.length;
    const checksBefore = permissionChecks();
    await act(async () => older.resolve([LOFI]));

    // NOTE: The stale response has been fully processed (its row state loaded) and had every
    // chance to render before we assert it did not.
    await waitFor(() => expect(permissionChecks()).toBe(checksBefore + 1));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByText('News')).toBeTruthy();
  });

  it('does not claim nothing is playing before the first list arrives', async () => {
    const first = deferred<AudibleTab[]>();
    backgroundLists(() => first.promise);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await act(async () => {});
    expect(screen.queryByText('Nothing is playing right now.')).toBeNull();
    expect(screen.queryAllByRole('button', { name: /^(Mute|Unmute) / })).toHaveLength(0);

    await act(async () => first.resolve([]));
    await waitFor(() => screen.getByText('Nothing is playing right now.'));
  });

  it.each([
    ['audible', { audible: true }],
    ['mute state', { mutedInfo: { muted: true } }],
    ['title', { title: 'Next song' }],
    // A kept row that navigated must not keep the previous site's icon.
    ['favicon', { favIconUrl: 'https://b.com/favicon.ico' }],
  ])('refreshes when a tab %s changes', async (_label, changeInfo) => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await act(() => fakeBrowser.tabs.onUpdated.trigger(1, changeInfo as any, {} as chrome.tabs.Tab));

    await waitFor(() => expect(listCalls()).toHaveLength(2));
  });

  it('ignores tab changes that cannot affect the list (e.g. loading status)', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await act(() => fakeBrowser.tabs.onUpdated.trigger(1, { status: 'loading' }, {} as chrome.tabs.Tab));
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(listCalls()).toHaveLength(1);
  });

  it('refreshes when a tab is closed', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await act(() => fakeBrowser.tabs.onRemoved.trigger(1, { windowId: 1, isWindowClosing: false }));

    await waitFor(() => expect(listCalls()).toHaveLength(2));
  });

  it('stops listening to tab events once closed', async () => {
    const { unmount } = render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    unmount();

    await act(() => fakeBrowser.tabs.onUpdated.trigger(1, { audible: false }, {} as chrome.tabs.Tab));
    await act(() => fakeBrowser.tabs.onRemoved.trigger(1, { windowId: 1, isWindowClosing: false }));
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(listCalls()).toHaveLength(1);
  });

  it('first asks for the list with nothing to keep', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    expect(listCalls()[0][0]).toEqual({ type: 'list', keep: [] });
  });

  it('hides the empty state while tabs are listed', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    expect(screen.queryByText('Nothing is playing right now.')).toBeNull();
  });

  it('offers Mute all (not Unmute all) when nothing is listed', async () => {
    backgroundLists([]);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Nothing is playing right now.'));
    expect(screen.getByRole('button', { name: /(^|\s)Mute all$/ })).toBeTruthy();
  });

  it('offers Mute all while only some tabs are muted', async () => {
    backgroundLists([{ ...LOFI, muted: true }, NEWS]);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('News'));
    fireEvent.click(screen.getByRole('button', { name: /(^|\s)Mute all$/ }));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: true, keep: [1, 2] });
  });

  it('the row mute button mutes that tab and refreshes', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    fireEvent.click(screen.getByRole('button', { name: 'Mute Lofi' }));

    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'toggleMute', tabId: 1, muted: true });
  });

  it('the row unmute button unmutes a muted tab', async () => {
    backgroundLists([{ ...LOFI, muted: true }]);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    fireEvent.click(screen.getByRole('button', { name: 'Unmute Lofi' }));

    await waitFor(() =>
      expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'toggleMute', tabId: 1, muted: false }),
    );
  });

  it('a granted row shows the stored site volume', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('youtube.com', 0.3);
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);

    await waitFor(() => expect(screen.getByRole('slider')).toHaveValue('30'));
    expect(screen.getByText('30%')).toBeTruthy();
  });

  // NOTE: review finding (2026-11-06): a granted site with no stored choice showed 100%
  // while the page played at its own level; the first slider touch then jumped.
  it('a granted site with no chosen volume shows what the page really plays at', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    fakeBrowser.tabs.sendMessage = vi.fn(async (_tabId: number, msg: any) =>
      msg.type === 'readVolume' ? 0.5 : undefined,
    ) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);

    await waitFor(() => expect(screen.getByRole('slider')).toHaveValue('50'));
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(1, { type: 'readVolume' });
  });

  it('a stored choice is shown without asking the page', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('youtube.com', 0.3);
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    fakeBrowser.tabs.sendMessage = vi.fn(async () => 0.5) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);

    await waitFor(() => expect(screen.getByRole('slider')).toHaveValue('30'));
    expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('shows 100% when the page cannot report its volume', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    fakeBrowser.tabs.sendMessage = vi.fn(async () => {
      throw new Error('Receiving end does not exist.');
    }) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);

    await waitFor(() => expect(screen.getByRole('slider')).toHaveValue('100'));
  });

  it('does not ask an ungranted page (no script runs there)', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => 0.5) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText(/control volume here/i));
    expect(fakeBrowser.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('moving the slider shows the new volume at once and sends it for the site', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByRole('slider'));

    fireEvent.input(screen.getByRole('slider'), { target: { value: '40' } });

    await waitFor(() => screen.getByText('40%'));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'setVolume',
      tabId: 1,
      origin: 'youtube.com',
      volume: 0.4,
    });
  });

  // NOTE: review bug (2026-11-06): a refresh fired mid-drag (raising a 0% site wakes its tabs
  // and flips `audible`) read storage before the background stored the new volume, and
  // snapped the thumb back under the cursor.
  it('a refresh during a volume change keeps the volume the user just set', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('youtube.com', 0.1);
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    const stored = deferred<void>();
    const background = fakeBrowser.runtime.sendMessage as ReturnType<typeof vi.fn>;
    const listOnly = background.getMockImplementation()!;
    fakeBrowser.runtime.sendMessage = vi.fn((msg: any) => (msg.type === 'setVolume' ? stored.promise : listOnly(msg))) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('10%'));

    fireEvent.input(screen.getByRole('slider'), { target: { value: '40' } });
    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByRole('slider')).toHaveValue('40');

    // NOTE: Once the write is confirmed, storage is the source of truth again.
    await act(async () => stored.resolve());
    await setSiteVolume('youtube.com', 0.25);
    await tabUpdated();
    await waitFor(() => screen.getByText('25%'));
  });

  it('with two volume writes in flight, the first confirmation does not drop the second', async () => {
    const { setSiteVolume } = await import('@/lib/storage');
    await setSiteVolume('youtube.com', 0.1);
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    const writes = [deferred<void>(), deferred<void>()];
    let write = 0;
    const listOnly = (fakeBrowser.runtime.sendMessage as ReturnType<typeof vi.fn>).getMockImplementation()!;
    fakeBrowser.runtime.sendMessage = vi.fn((msg: any) =>
      msg.type === 'setVolume' ? writes[write++].promise : listOnly(msg),
    ) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('10%'));

    fireEvent.input(screen.getByRole('slider'), { target: { value: '30' } });
    fireEvent.input(screen.getByRole('slider'), { target: { value: '40' } });
    await act(async () => writes[0].resolve());
    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(screen.getByText('40%')).toBeTruthy();
  });

  it('a granted opt-in tells the background and refreshes', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => true) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText(/control volume here/i));

    fireEvent.click(screen.getByText(/control volume here/i));

    await waitFor(() => expect(listCalls()).toHaveLength(2));
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins: ['*://youtube.com/*'] });
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'grantSite', tabId: 1, origin: 'youtube.com' });
  });

  it('a denied opt-in sends nothing', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => false) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText(/control volume here/i));

    fireEvent.click(screen.getByText(/control volume here/i));
    await act(() => new Promise((r) => setTimeout(r, 20)));

    expect(fakeBrowser.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'grantSite' }));
    expect(listCalls()).toHaveLength(1);
  });

  // NOTE: review bug (2026-11-06): one origin whose permission/volume lookup rejected sank the
  // whole refresh; on first load the panel stayed blank (not even the empty state).
  it('still lists every row when one origin lookup fails', async () => {
    backgroundLists([LOFI, NEWS]);
    fakeBrowser.permissions.contains = vi.fn(async ({ origins }: { origins: string[] }) => {
      if (origins[0].includes('news.com')) throw new Error('Invalid match pattern');
      return true;
    }) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);

    await waitFor(() => screen.getByText('News'));
    expect(screen.getByText('Lofi')).toBeTruthy();
    expect(screen.getAllByRole('slider')).toHaveLength(1); // Lofi granted; News falls back to opt-in
    expect(screen.getByText(/control volume here/i)).toBeTruthy();
  });

  it('recovers on the next tab event when the first list request fails', async () => {
    let first = true;
    fakeBrowser.runtime.sendMessage = vi.fn(async (msg: any) => {
      if (msg.type !== 'list') return undefined;
      if (first) {
        first = false;
        throw new Error('Could not establish connection');
      }
      return [LOFI];
    }) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await act(() => new Promise((r) => setTimeout(r, 20)));

    await tabUpdated();

    await waitFor(() => screen.getByText('Lofi'));
  });

  it('keeps the current rows when a refresh gets no list back', async () => {
    // NOTE: The background answers `undefined` when its handler throws.
    backgroundLists([LOFI], undefined);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await act(async () => {});

    expect(screen.getByText('Lofi')).toBeTruthy();
  });
});
