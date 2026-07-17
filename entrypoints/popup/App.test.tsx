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

  it('sends muteAll when the master button is clicked', async () => {
    render(<App donateUrl="https://ko-fi.com/x" />);
    await waitFor(() => screen.getByText('Lofi'));
    fireEvent.click(screen.getByText(/mute all/i));
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'muteAll' });
  });
});
