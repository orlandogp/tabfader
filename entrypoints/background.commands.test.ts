import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleCommand } from './background';

function activeTab(tab: Partial<chrome.tabs.Tab> | undefined) {
  fakeBrowser.tabs.query = vi.fn(async () => (tab ? [tab as chrome.tabs.Tab] : [])) as any;
  fakeBrowser.tabs.update = vi.fn() as any;
}

describe('handleCommand', () => {
  it('mutes the active tab of the current window when it is unmuted', async () => {
    activeTab({ id: 5, url: 'https://a.com', mutedInfo: { muted: false } });
    await handleCommand('toggle-mute-active');
    expect(fakeBrowser.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(5, { muted: true });
  });

  it('unmutes the active tab when it is muted', async () => {
    activeTab({ id: 5, url: 'https://a.com', mutedInfo: { muted: true } });
    await handleCommand('toggle-mute-active');
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(5, { muted: false });
  });

  it('treats a tab without mute info as unmuted', async () => {
    activeTab({ id: 5, url: 'https://a.com' });
    await handleCommand('toggle-mute-active');
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(5, { muted: true });
  });

  it('does nothing without an active tab or with an id-less one', async () => {
    activeTab(undefined);
    await handleCommand('toggle-mute-active');
    activeTab({ url: 'https://a.com' });
    await handleCommand('toggle-mute-active');
    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });

  it('does nothing when command is not toggle-mute-active', async () => {
    activeTab({ id: 5, url: 'https://a.com', mutedInfo: { muted: false } });
    await handleCommand('some-other-command');
    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });
});
