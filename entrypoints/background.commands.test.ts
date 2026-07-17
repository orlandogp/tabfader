import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { handleCommand } from './background';

describe('handleCommand', () => {
  it('toggles mute on the active tab', async () => {
    const tabId = 5;
    fakeBrowser.tabs.query = vi.fn(async () => [
      { id: tabId, active: true, url: 'https://a.com', mutedInfo: { muted: false } } as chrome.tabs.Tab,
    ]) as any;
    fakeBrowser.tabs.update = vi.fn();
    await handleCommand('toggle-mute-active');
    expect(fakeBrowser.tabs.update).toHaveBeenCalledWith(tabId, { muted: true });
  });

  it('does nothing when command is not toggle-mute-active', async () => {
    fakeBrowser.tabs.update = vi.fn();
    await handleCommand('some-other-command');
    expect(fakeBrowser.tabs.update).not.toHaveBeenCalled();
  });
});
