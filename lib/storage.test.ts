import { describe, it, expect } from 'vitest';
import { getSiteVolume, setSiteVolume } from './storage';

describe('site volume storage', () => {
  it('defaults to full volume for an unknown origin', async () => {
    expect(await getSiteVolume('youtube.com')).toBe(1.0);
  });
  it('persists and reads back a clamped volume', async () => {
    await setSiteVolume('youtube.com', 0.65);
    expect(await getSiteVolume('youtube.com')).toBe(0.65);
    await setSiteVolume('youtube.com', 5);
    expect(await getSiteVolume('youtube.com')).toBe(1);
  });
});

describe('getSitePref', () => {
  // A site the user never set a volume for must be left alone, so "no preference" has
  // to be distinguishable from "100%".
  it('returns null when nothing is stored', async () => {
    const { getSitePref } = await import('./storage');
    expect(await getSitePref('youtube.com')).toBeNull();
  });

  it('returns the stored volume, clamped', async () => {
    const { getSitePref } = await import('./storage');
    await setSiteVolume('youtube.com', 0.3);
    expect(await getSitePref('youtube.com')).toEqual({ volume: 0.3 });
  });
});
