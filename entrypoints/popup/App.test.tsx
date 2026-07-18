import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/preact';
import { fakeBrowser } from 'wxt/testing';
import { App } from './App';

beforeEach(() => {
  fakeBrowser.runtime.sendMessage = vi.fn(async (msg: any) => {
    if (msg.type === 'list') {
      return [{ id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: false }];
    }
    return undefined;
  }) as any;
  fakeBrowser.permissions.contains = vi.fn(async () => false) as any;
});

describe('App', () => {
  it('lists audible tabs from the background', async () => {
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
    fakeBrowser.runtime.sendMessage = vi.fn(async (msg: any) => {
      if (msg.type === 'list') {
        return [{ id: 1, title: 'Lofi', url: 'https://youtube.com', origin: 'youtube.com', muted: true }];
      }
      return undefined;
    }) as any;
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/unmute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll', muted: false });
  });

  it('refreshes the tab list live when a tab becomes audible while the popup is open', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));

    const listCalls = () =>
      (fakeBrowser.runtime.sendMessage as ReturnType<typeof vi.fn>).mock.calls.filter(
        ([msg]: [{ type: string }]) => msg.type === 'list',
      ).length;
    expect(listCalls()).toBe(1);

    // NOTE: the popup subscribes to `tabs.onUpdated` while it's open (see
    // App.tsx mount effect) so the list stays live instead of only
    // snapshotting once on mount.
    await fakeBrowser.tabs.onUpdated.trigger(1, { audible: true }, {} as chrome.tabs.Tab);

    await waitFor(() => expect(listCalls()).toBe(2));
  });
});
