import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import type { ContentMessage } from '@/lib/messages';
import { getSiteVolume } from '@/lib/storage';
import { originKeyFromUrl } from '@/lib/origin';
import { clampVolume } from '@/lib/volume';

/** Pure, testable: set .volume on every media element under `root`. Returns count. */
export function applyVolumeToMedia(root: ParentNode, volume: number): number {
  const v = clampVolume(volume);
  const media = root.querySelectorAll('video, audio');
  media.forEach((el) => {
    (el as HTMLMediaElement).volume = v;
  });
  return media.length;
}

export default defineContentScript({
  matches: [],               // no static matches — registered at runtime per granted origin
  registration: 'runtime',
  runAt: 'document_start',
  allFrames: true,
  async main() {
    const origin = originKeyFromUrl(location.href);
    let current = origin ? await getSiteVolume(origin) : 1;

    applyVolumeToMedia(document, current);

    const observer = new MutationObserver(() => applyVolumeToMedia(document, current));
    observer.observe(document.documentElement, { childList: true, subtree: true });

    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'applyVolume') {
        current = msg.volume;
        applyVolumeToMedia(document, current);
      }
    });
  },
});
