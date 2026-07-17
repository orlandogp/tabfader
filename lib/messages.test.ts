import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { sendToBackground, sendToTab, type BackgroundMessage } from './messages';

describe('message wrappers', () => {
  it('sendToBackground forwards via runtime.sendMessage and returns the response', async () => {
    fakeBrowser.runtime.sendMessage = vi.fn(async () => [{ id: 1 }]) as any;
    const msg: BackgroundMessage = { type: 'list' };
    const res = await sendToBackground(msg);
    expect(fakeBrowser.runtime.sendMessage).toHaveBeenCalledWith(msg);
    expect(res).toEqual([{ id: 1 }]);
  });

  it('sendToTab forwards via tabs.sendMessage', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    await sendToTab(7, { type: 'applyVolume', volume: 0.5 });
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'applyVolume', volume: 0.5 });
  });
});
