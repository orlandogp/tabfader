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
