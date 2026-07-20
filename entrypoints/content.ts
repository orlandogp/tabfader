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

/** DOM event a fresh copy of this script dispatches so orphans know a successor exists. */
export const ALIVE_EVENT = 'tabtune:alive';

/**
 * There is no browser event for extension uninstall, so an injected script
 * must detect its own orphaning: poll `isAlive`; on death call `onOrphaned`
 * (stop enforcing immediately), then wait `graceMs` for a successor script
 * (extension UPDATE — leave everything to it). If none announces itself, the
 * extension was UNINSTALLED: call `onUninstalled` (restore page defaults).
 */
export function watchExtensionLiveness(opts: {
  isAlive: () => boolean;
  onOrphaned: () => void;
  onUninstalled: () => void;
  successorEvents: EventTarget;
  checkMs?: number;
  graceMs?: number;
}): void {
  const { isAlive, onOrphaned, onUninstalled, successorEvents, checkMs = 5000, graceMs = 8000 } = opts;
  let successorSeen = false;
  successorEvents.addEventListener(ALIVE_EVENT, () => {
    successorSeen = true;
  });

  const timer = setInterval(() => {
    if (isAlive()) return;
    clearInterval(timer);
    onOrphaned();
    if (successorSeen) return;
    setTimeout(() => {
      if (!successorSeen) onUninstalled();
    }, graceMs);
  }, checkMs);
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

    // Announce this copy to any orphaned predecessors, then self-monitor:
    // if the extension dies and NO successor shows up (uninstall, not update),
    // restore the default volume so the tab is left as if we were never here.
    document.dispatchEvent(new CustomEvent(ALIVE_EVENT));
    watchExtensionLiveness({
      isAlive: () => Boolean(browser.runtime?.id),
      onOrphaned: () => observer.disconnect(),
      onUninstalled: () => applyVolumeToMedia(document, 1),
      successorEvents: document,
    });

    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'applyVolume') {
        current = msg.volume;
        applyVolumeToMedia(document, current);
      }
    });
  },
});
