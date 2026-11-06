import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import type { ContentMessage } from '@/lib/messages';
import { getSitePref } from '@/lib/storage';
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

/** Sets `.volume` only when it differs: every write fires `volumechange`, which we listen to. */
export function enforceVolume(el: HTMLMediaElement, volume: number): void {
  const v = clampVolume(volume);
  if (el.volume !== v) el.volume = v;
}

const MEDIA_SELECTOR = 'video, audio';

/**
 * Keeps every media element of `root` at the volume the user chose for this site.
 * `set(null)` = no choice yet: the page keeps full control of its own volume. Once a
 * volume is chosen it wins, including over the page re-assigning `.volume` itself
 * (players that reuse one element do that on every new video).
 */
export function createVolumeEnforcer(root: Document) {
  let target: number | null = null;
  let enforced = false;

  const onVolumeChange = (event: Event) => {
    if (target !== null && event.target instanceof HTMLMediaElement) enforceVolume(event.target, target);
  };
  // NOTE: media events do not bubble; a capture listener on the document still sees them.
  root.addEventListener('volumechange', onVolumeChange, true);

  // Only scans what was added, not the whole document on every mutation (chat-heavy SPAs
  // mutate constantly).
  const observer = new MutationObserver((records) => {
    if (target === null) return;
    for (const record of records) {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node instanceof HTMLMediaElement) enforceVolume(node, target!);
        node.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR).forEach((el) => enforceVolume(el, target!));
      });
    }
  });
  observer.observe(root.documentElement, { childList: true, subtree: true });

  return {
    set(volume: number | null) {
      target = volume === null ? null : clampVolume(volume);
      if (target === null) return;
      enforced = true;
      root.querySelectorAll<HTMLMediaElement>(MEDIA_SELECTOR).forEach((el) => enforceVolume(el, target!));
    },
    /** True once a chosen volume was applied, i.e. there is something to undo on uninstall. */
    hasEnforced: () => enforced,
    stop() {
      observer.disconnect();
      root.removeEventListener('volumechange', onVolumeChange, true);
    },
  };
}

/** DOM event a fresh copy of this script dispatches so orphans know a successor exists. */
export const ALIVE_EVENT = 'tabfader:alive';

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

// NOTE: wiring only; the browser runs it, so the E2E suite (not unit tests) covers it.
// Stryker disable all
export default defineContentScript({
  matches: [],               // no static matches — registered at runtime per granted origin
  registration: 'runtime',
  runAt: 'document_start',
  allFrames: true,
  async main(ctx) {
    const origin = originKeyFromUrl(location.href);
    const enforcer = createVolumeEnforcer(document);
    enforcer.set(origin ? ((await getSitePref(origin))?.volume ?? null) : null);

    // Extension reloads/updates orphan this script: its runtime channel dies
    // but it would keep re-applying a stale volume forever, fighting
    // the fresh script injected by the new extension version. WXT invalidates
    // the context when a newer copy starts (script-started handshake) — stop
    // enforcing the moment that happens.
    ctx.onInvalidated(() => enforcer.stop());

    // Announce this copy to any orphaned predecessors, then self-monitor:
    // if the extension dies and NO successor shows up (uninstall, not update),
    // restore the default volume so the tab is left as if we were never here.
    document.dispatchEvent(new CustomEvent(ALIVE_EVENT));
    watchExtensionLiveness({
      isAlive: () => Boolean(browser.runtime?.id),
      onOrphaned: () => enforcer.stop(),
      onUninstalled: () => {
        if (enforcer.hasEnforced()) applyVolumeToMedia(document, 1);
      },
      successorEvents: document,
    });

    browser.runtime.onMessage.addListener((msg: ContentMessage) => {
      if (msg?.type === 'applyVolume') enforcer.set(msg.volume);
    });
  },
});
// Stryker restore all
