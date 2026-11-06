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

  it('sends muteAll (muted: true) when not every tab is muted', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/mute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: true });
  });

  it('offers Unmute all (muted: false) when every tab is already muted', async () => {
    backgroundLists([{ ...LOFI, muted: true }]);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/unmute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: false });
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

  // FIELD BUG (2026-11-06): rows rendered first and fetched their permission/volume after,
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

    // The stale response has been fully processed (its row state loaded) and had every
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

    await act(async () => first.resolve([]));
    await waitFor(() => screen.getByText('Nothing is playing right now.'));
  });

  it('keeps the current rows when a refresh gets no list back', async () => {
    // The background answers `undefined` when its handler throws.
    backgroundLists([LOFI], undefined);
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    await tabUpdated();
    await waitFor(() => expect(listCalls()).toHaveLength(2));
    await act(async () => {});

    expect(screen.getByText('Lofi')).toBeTruthy();
  });
});
