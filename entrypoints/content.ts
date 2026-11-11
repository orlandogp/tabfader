import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import type { ContentMessage } from '@/lib/messages';
import { getSitePref } from '@/lib/storage';
import { originKeyFromUrl } from '@/lib/origin';
import { clampVolume } from '@/lib/volume';

/** Sets `.volume` only when it differs: every write fires `volumechange`, which we listen to. */
export function enforceVolume(el: HTMLMediaElement, volume: number): void {
  const v = clampVolume(volume);
  if (el.volume !== v) el.volume = v;
}


// NOTE: a player that reuses its element re-assigns .volume about once per video; anything
// faster is another writer enforcing its own value (a second volume extension, a "volume
// lock" player). Past this budget we yield that element instead of ping-ponging forever.
const MAX_REENFORCEMENTS = 5;
const REENFORCE_WINDOW_MS = 1000;

/** `node`, its descendants and, through open shadow roots, theirs (closed roots stay hidden). */
function* deepElements(node: Element): Generator<Element> {
  for (const el of [node, ...node.querySelectorAll('*')]) {
    yield el;
    if (el.shadowRoot) for (const child of el.shadowRoot.children) yield* deepElements(child);
  }
}

/**
 * The page's own current volume, for showing a site with no stored choice as it really
 * plays: the playing media element's, else the first one's; null when there is no media.
 */
export function readPageVolume(root: Document): number | null {
  let first: HTMLMediaElement | null = null;
  for (const el of deepElements(root.documentElement)) {
    if (!(el instanceof HTMLMediaElement)) continue;
    if (!el.paused) return el.volume;
    first ??= el;
  }
  return first?.volume ?? null;
}

/**
 * Keeps every media element of `root` at the volume the user chose for this site.
 * `set(null)` = no choice yet: the page keeps full control of its own volume. Once a
 * volume is chosen it wins, including over the page re-assigning `.volume` itself
 * (players that reuse one element do that on every new video).
 */
export function createVolumeEnforcer(root: Document) {
  let target: number | null = null;
  // NOTE: the page's own volume per element, captured right before TabFader's first write,
  // so turning TabFader off hands it back exactly (WeakRefs: never keep removed media alive).
  const originals = new WeakMap<HTMLMediaElement, number>();
  const touched = new Set<WeakRef<HTMLMediaElement>>();
  function write(el: HTMLMediaElement) {
    if (!originals.has(el) && el.volume !== target) {
      originals.set(el, el.volume);
      touched.add(new WeakRef(el));
    }
    enforceVolume(el, target!);
  }
  let fights = new WeakMap<HTMLMediaElement, { since: number; count: number }>();

  const onVolumeChange = (event: Event) => {
    const el = event.target;
    if (target === null || !(el instanceof HTMLMediaElement) || el.volume === target) return;
    const now = Date.now();
    let fight = fights.get(el);
    if (!fight || now - fight.since > REENFORCE_WINDOW_MS) fight = { since: now, count: 0 };
    fights.set(el, fight);
    if (++fight.count > MAX_REENFORCEMENTS) return; // yielded until the user picks a volume again
    write(el);
  };
  // NOTE: only what was added is scanned, not the whole document on every mutation
  // (chat-heavy SPAs mutate constantly).
  const observer = new MutationObserver((records) => {
    if (target === null) return;
    for (const record of records) record.addedNodes.forEach(visit);
  });

  // NOTE: open shadow roots are separate scopes: querySelectorAll does not enter them and
  // their (non-composed) volumechange never reaches the document, so each one found gets
  // its own capture listener and observation. Closed roots stay unreachable by design.
  const scopes = new Set<Document | ShadowRoot>();
  function watch(scope: Document | ShadowRoot) {
    if (scopes.has(scope)) return;
    scopes.add(scope);
    // NOTE: media events do not bubble; a capture listener on the scope still sees them.
    scope.addEventListener('volumechange', onVolumeChange, true);
    observer.observe(scope instanceof Document ? scope.documentElement : scope, { childList: true, subtree: true });
  }

  /** Enforces the chosen volume (callers guarantee one) on media at or under `node`. */
  function visit(node: Node) {
    if (!(node instanceof Element)) return;
    for (const el of deepElements(node)) {
      if (el instanceof HTMLMediaElement) write(el);
      if (el.shadowRoot) watch(el.shadowRoot);
    }
  }

  function stop() {
    observer.disconnect();
    for (const scope of scopes) scope.removeEventListener('volumechange', onVolumeChange, true);
    scopes.clear();
  }

  watch(root);

  return {
    set(volume: number | null) {
      target = volume === null ? null : clampVolume(volume);
      fights = new WeakMap(); // a fresh choice is worth fighting for again
      if (target === null) return;
      visit(root.documentElement);
    },
    stop,
    /** Stops enforcing and gives every touched element back its pre-TabFader volume. */
    restore() {
      stop();
      for (const ref of touched) {
        const el = ref.deref();
        if (el) el.volume = originals.get(el)!;
      }
      touched.clear();
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
      onUninstalled: () => enforcer.restore(),
      successorEvents: document,
    });

    browser.runtime.onMessage.addListener((msg: ContentMessage, _sender, sendResponse) => {
      if (msg?.type === 'applyVolume') enforcer.set(msg.volume);
      // NOTE: only the top frame answers, so an iframe's player can't speak for the tab.
      if (msg?.type === 'readVolume' && window === window.top) sendResponse(readPageVolume(document));
    });
  },
});
// Stryker restore all
