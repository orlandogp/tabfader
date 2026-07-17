import { describe, it, expect, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { hasOriginPermission, requestOriginPermission, removeOriginPermission } from './permissions';

describe('permissions helper', () => {
  it('checks contains with the origin match pattern', async () => {
    fakeBrowser.permissions.contains = vi.fn(async () => true) as any;
    expect(await hasOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.contains).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });

  it('requests the origin permission and returns the grant result', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => true) as any;
    expect(await requestOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });

  it('removes the origin permission', async () => {
    fakeBrowser.permissions.remove = vi.fn(async () => true) as any;
    expect(await removeOriginPermission('twitch.tv')).toBe(true);
    expect(fakeBrowser.permissions.remove).toHaveBeenCalledWith({ origins: ['*://twitch.tv/*'] });
  });
});
