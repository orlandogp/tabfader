import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyVolumeToMedia, createVolumeEnforcer, enforceVolume, watchExtensionLiveness } from './content';

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

describe('enforceVolume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Writing .volume fires `volumechange`, which the enforcer listens to: an unconditional
  // write would re-trigger itself forever.
  it('leaves an element already at the target untouched', () => {
    const el = document.createElement('audio');
    el.volume = 0.3;
    const setter = vi.spyOn(HTMLMediaElement.prototype, 'volume', 'set');
    enforceVolume(el, 0.3);
    expect(setter).not.toHaveBeenCalled();
  });

  it('sets a different volume, clamped into [0,1]', () => {
    const el = document.createElement('audio');
    enforceVolume(el, 0.3);
    expect(el.volume).toBe(0.3);
    enforceVolume(el, -2);
    expect(el.volume).toBe(0);
  });
});

describe('createVolumeEnforcer', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  function setup(html: string) {
    document.body.innerHTML = html;
    const enforcer = createVolumeEnforcer(document);
    stop = enforcer.stop;
    return enforcer;
  }
  const audio = () => document.querySelector('audio') as HTMLAudioElement;
  const pageSetsVolume = (el: HTMLMediaElement, v: number) => {
    el.volume = v;
    el.dispatchEvent(new Event('volumechange')); // what the browser fires on every .volume write
  };

  // REVIEW BUG (2026-11-06): granting a site applied the 100% default to its media, so a
  // page the user kept at 50% jumped to full volume before they ever touched the slider.
  it('touches nothing until a volume is chosen', () => {
    const enforcer = setup('<audio></audio>');
    audio().volume = 0.5;
    enforcer.set(null);
    expect(audio().volume).toBe(0.5);
    pageSetsVolume(audio(), 0.7);
    expect(audio().volume).toBe(0.7);
  });

  it('applies the chosen volume to existing media', () => {
    const enforcer = setup('<audio></audio><video></video>');
    enforcer.set(0.3);
    expect(audio().volume).toBe(0.3);
    expect((document.querySelector('video') as HTMLVideoElement).volume).toBe(0.3);
  });

  // REVIEW BUG (2026-11-06): players that reuse one element (YouTube) re-assign .volume on
  // every new video; the old DOM-only observer never noticed and the choice was lost.
  it('re-applies the chosen volume when the page changes it', () => {
    const enforcer = setup('<audio></audio>');
    enforcer.set(0.3);
    pageSetsVolume(audio(), 1);
    expect(audio().volume).toBe(0.3);
  });

  it('applies the chosen volume to media added later, even nested', async () => {
    const enforcer = setup('');
    enforcer.set(0.3);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = '<span><video></video></span>';
    document.body.appendChild(wrapper);
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver callbacks are async
    expect((wrapper.querySelector('video') as HTMLVideoElement).volume).toBe(0.3);
  });

  it('stops enforcing after stop()', () => {
    const enforcer = setup('<audio></audio>');
    enforcer.set(0.3);
    enforcer.stop();
    pageSetsVolume(audio(), 1);
    expect(audio().volume).toBe(1);
  });

  it('reports whether it ever enforced a chosen volume', () => {
    const enforcer = setup('<audio></audio>');
    expect(enforcer.hasEnforced()).toBe(false);
    enforcer.set(0.3);
    expect(enforcer.hasEnforced()).toBe(true);
  });
});

describe('watchExtensionLiveness', () => {
  // There is NO uninstall event for extensions: injected scripts become
  // orphans whose observers would keep enforcing a stale volume. The sentinel
  // polls extension liveness; on death it stops enforcement immediately, then
  // waits a grace window for a successor script (extension UPDATE case — do
  // not touch anything). If no successor shows up, the extension was
  // UNINSTALLED: restore defaults so tabs are left as if we were never there.
  afterEach(() => {
    vi.useRealTimers();
  });

  it('on extension death without successor: orphaned, then restore', () => {
    vi.useFakeTimers();
    let alive = true;
    const onOrphaned = vi.fn();
    const onUninstalled = vi.fn();
    watchExtensionLiveness({
      isAlive: () => alive,
      onOrphaned,
      onUninstalled,
      successorEvents: document,
      checkMs: 1000,
      graceMs: 5000,
    });

    vi.advanceTimersByTime(3000);
    expect(onOrphaned).not.toHaveBeenCalled();

    alive = false;
    vi.advanceTimersByTime(1000);
    expect(onOrphaned).toHaveBeenCalledTimes(1);
    expect(onUninstalled).not.toHaveBeenCalled(); // still in grace window

    vi.advanceTimersByTime(5000);
    expect(onUninstalled).toHaveBeenCalledTimes(1);
  });

  it('on extension death with a successor script: orphaned but NO restore', () => {
    vi.useFakeTimers();
    let alive = true;
    const onOrphaned = vi.fn();
    const onUninstalled = vi.fn();
    watchExtensionLiveness({
      isAlive: () => alive,
      onOrphaned,
      onUninstalled,
      successorEvents: document,
      checkMs: 1000,
      graceMs: 5000,
    });

    alive = false;
    vi.advanceTimersByTime(1000);
    expect(onOrphaned).toHaveBeenCalledTimes(1);

    // a fresh copy (extension update) announces itself during the grace window
    document.dispatchEvent(new CustomEvent('tabfader:alive'));
    vi.advanceTimersByTime(10_000);
    expect(onUninstalled).not.toHaveBeenCalled();
  });
});
