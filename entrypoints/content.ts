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
  async main(ctx) {
    const origin = originKeyFromUrl(location.href);
    let current = origin ? await getSiteVolume(origin) : 1;

    applyVolumeToMedia(document, current);

    const observer = new MutationObserver(() => applyVolumeToMedia(document, current));
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // Extension reloads/updates orphan this script: its runtime channel dies
    // but the observer would keep re-applying a stale volume forever, fighting
    // the fresh script injected by the new extension version. WXT invalidates
    // the context when a newer copy starts (script-started handshake) — stop
    // enforcing the moment that happens.
    ctx.onInvalidated(() => observer.disconnect());

    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'applyVolume') {
        current = msg.volume;
        applyVolumeToMedia(document, current);
      }
    });
  },
});
