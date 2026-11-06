import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyVolumeToMedia, createVolumeEnforcer, enforceVolume, readPageVolume, watchExtensionLiveness } from './content';

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

  // NOTE: Writing .volume fires `volumechange`, which the enforcer listens to: an unconditional
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

  // NOTE: review bug (2026-11-06): granting a site applied the 100% default to its media, so a
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

  // NOTE: review bug (2026-11-06): players that reuse one element (YouTube) re-assign .volume on
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

  it('leaves media added later alone while no volume is chosen', async () => {
    const enforcer = setup('');
    enforcer.set(null);
    const late = document.createElement('audio');
    late.volume = 0.6;
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.volume).toBe(0.6);
  });

  it('handles media appended directly, next to non-element nodes', async () => {
    const enforcer = setup('');
    enforcer.set(0.3);
    document.body.appendChild(document.createTextNode('caption'));
    const late = document.createElement('audio');
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.volume).toBe(0.3);
  });

  it('stops applying the volume to media added after stop()', async () => {
    const enforcer = setup('');
    enforcer.set(0.3);
    enforcer.stop();
    const late = document.createElement('audio');
    document.body.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.volume).toBe(1);
  });

  // NOTE: review bug (2026-11-06): another writer that also enforces .volume (a second volume
  // extension, a "volume lock" player) ping-ponged with us forever, burning a CPU core
  // and warbling the audio. We back off from an element that keeps fighting.
  it('gives up on an element that keeps overriding the chosen volume', () => {
    vi.useFakeTimers();
    try {
      const enforcer = setup('<audio></audio>');
      const el = audio();
      let value = 1;
      let eventPending = false;
      const ourWrites: number[] = [];
      Object.defineProperty(el, 'volume', {
        get: () => value,
        set: (v: number) => {
          value = v;
          if (v === 0.3) ourWrites.push(v);
          // NOTE: The browser fires volumechange async. One pending event at a time keeps the
          // simulated fight linear instead of doubling its events every round.
          if (eventPending) return;
          eventPending = true;
          setTimeout(() => {
            eventPending = false;
            el.dispatchEvent(new Event('volumechange'));
          }, 0);
        },
      });
      // NOTE: The rival re-asserts 1 every time the volume changes.
      el.addEventListener('volumechange', () => {
        if (value !== 1) el.volume = 1;
      });

      enforcer.set(0.3);
      // NOTE: Step event by event (an unbounded fight never lets advanceTimersByTime return).
      for (let step = 0; step < 200; step++) vi.advanceTimersToNextTimer();

      expect(ourWrites.length).toBeGreaterThan(1); // we did try to win
      expect(ourWrites.length).toBeLessThanOrEqual(6); // ...but stopped fighting
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-enforces every occasional override, and its own writes do not use up the budget', () => {
    vi.useFakeTimers();
    try {
      const enforcer = setup('<audio></audio>');
      const el = audio();
      let value = 1;
      Object.defineProperty(el, 'volume', {
        get: () => value,
        set: (v: number) => {
          value = v;
          setTimeout(() => el.dispatchEvent(new Event('volumechange')), 0); // like the browser
        },
      });
      enforcer.set(0.3);
      vi.runAllTimers();

      // Five separate page overrides inside one second (e.g. quick track skips).
      for (let i = 0; i < 5; i++) {
        value = 1;
        el.dispatchEvent(new Event('volumechange'));
        vi.runAllTimers(); // our write's own volumechange
        expect(value).toBe(0.3);
        vi.advanceTimersByTime(100);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('fights again after the user picks a new volume', () => {
    vi.useFakeTimers();
    try {
      const enforcer = setup('<audio></audio>');
      const el = audio();
      for (let i = 0; i < 10; i++) {
        enforcer.set(0.3);
        pageSetsVolume(el, 1); // a fight: re-enforced each time until we back off
      }
      enforcer.set(0.5);
      expect(el.volume).toBe(0.5);
      pageSetsVolume(el, 1);
      expect(el.volume).toBe(0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps re-enforcing an occasional override (new video in a reused player)', () => {
    vi.useFakeTimers();
    try {
      const enforcer = setup('<audio></audio>');
      enforcer.set(0.3);
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(5_000);
        pageSetsVolume(audio(), 1);
        expect(audio().volume).toBe(0.3);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // NOTE: review finding (2026-11-06): players built as web components (e.g. Reddit's)
  // keep their <video> inside an open shadow root, which querySelectorAll does not enter
  // and whose non-composed volumechange never reaches the document.
  describe('inside open shadow roots', () => {
    function shadowHost(inner: string) {
      const host = document.createElement('div');
      host.attachShadow({ mode: 'open' }).innerHTML = inner;
      return host;
    }
    const shadowAudio = (host: Element) => host.shadowRoot!.querySelector('audio') as HTMLAudioElement;
    const tick = () => new Promise((r) => setTimeout(r, 0));

    it('applies the chosen volume to existing shadow media, even nested', () => {
      const enforcer = setup('');
      const outer = shadowHost('<span></span>');
      const inner = shadowHost('<audio></audio>');
      outer.shadowRoot!.appendChild(inner);
      document.body.appendChild(outer);

      enforcer.set(0.3);

      expect(shadowAudio(inner).volume).toBe(0.3);
    });

    it('applies it to a player component added later', async () => {
      const enforcer = setup('');
      enforcer.set(0.3);
      const host = shadowHost('<audio></audio>');
      document.body.appendChild(host);
      await tick();
      expect(shadowAudio(host).volume).toBe(0.3);
    });

    it('applies it to media the component adds to its shadow root later', async () => {
      const enforcer = setup('');
      const host = shadowHost('');
      document.body.appendChild(host);
      enforcer.set(0.3);
      const late = document.createElement('audio');
      host.shadowRoot!.appendChild(late);
      await tick();
      expect(late.volume).toBe(0.3);
    });

    it('re-enforces when the component overrides its own volume', () => {
      const enforcer = setup('');
      const host = shadowHost('<audio></audio>');
      document.body.appendChild(host);
      enforcer.set(0.3);
      pageSetsVolume(shadowAudio(host), 1);
      expect(shadowAudio(host).volume).toBe(0.3);
    });

    it('stops re-enforcing inside shadow roots after stop()', () => {
      const enforcer = setup('');
      const host = shadowHost('<audio></audio>');
      document.body.appendChild(host);
      enforcer.set(0.3);
      enforcer.stop();
      pageSetsVolume(shadowAudio(host), 1);
      expect(shadowAudio(host).volume).toBe(1);
    });
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

// NOTE: review finding (2026-11-06): with no stored preference the popup showed 100% while
// the page played at its own level, and the first slider touch jumped the volume.
describe('readPageVolume', () => {
  const playing = (el: HTMLMediaElement) => Object.defineProperty(el, 'paused', { get: () => false });

  it('reports null when the page has no media', () => {
    document.body.innerHTML = '<div></div>';
    expect(readPageVolume(document)).toBeNull();
  });

  it('prefers the media element that is playing', () => {
    document.body.innerHTML = '<audio id="idle"></audio><video id="live"></video>';
    (document.getElementById('idle') as HTMLMediaElement).volume = 0.9;
    const live = document.getElementById('live') as HTMLMediaElement;
    live.volume = 0.5;
    playing(live);
    expect(readPageVolume(document)).toBe(0.5);
  });

  it('falls back to the first media element when none is playing', () => {
    document.body.innerHTML = '<audio></audio><audio></audio>';
    (document.querySelector('audio') as HTMLMediaElement).volume = 0.4;
    expect(readPageVolume(document)).toBe(0.4);
  });

  it('finds a player inside an open shadow root', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' }).innerHTML = '<audio></audio>';
    document.body.appendChild(host);
    (host.shadowRoot!.querySelector('audio') as HTMLMediaElement).volume = 0.7;
    expect(readPageVolume(document)).toBe(0.7);
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

    // NOTE: Polling stops once the death is handled: nothing fires twice.
    vi.advanceTimersByTime(30_000);
    expect(onOrphaned).toHaveBeenCalledTimes(1);
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
