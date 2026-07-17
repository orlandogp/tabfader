import { describe, it, expect } from 'vitest';
import { applyVolumeToMedia } from './content';

describe('applyVolumeToMedia', () => {
  it('sets .volume on all audio/video elements and counts them', () => {
    document.body.innerHTML = '<video></video><audio></audio><div></div>';
    const count = applyVolumeToMedia(document, 0.4);
    expect(count).toBe(2);
    const media = [...document.querySelectorAll('video,audio')] as HTMLMediaElement[];
    expect(media.every((m) => m.volume === 0.4)).toBe(true);
  });

  it('clamps volume into [0,1]', () => {
    document.body.innerHTML = '<video></video>';
    applyVolumeToMedia(document, 5);
    expect((document.querySelector('video') as HTMLMediaElement).volume).toBe(1);
  });
});
