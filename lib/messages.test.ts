import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { readTabVolume, sendToBackground, sendToTab, type BackgroundMessage } from './messages';

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

  it('readTabVolume returns the number the page reports, else null', async () => {
    fakeBrowser.tabs.sendMessage = vi.fn(async () => 0.4) as any;
    expect(await readTabVolume(7)).toBe(0.4);
    expect(fakeBrowser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'readVolume' });
    fakeBrowser.tabs.sendMessage = vi.fn(async () => undefined) as any;
    expect(await readTabVolume(7)).toBeNull();
    fakeBrowser.tabs.sendMessage = vi.fn(async () => {
      throw new Error('Receiving end does not exist.');
    }) as any;
    expect(await readTabVolume(7)).toBeNull();
  });
});
