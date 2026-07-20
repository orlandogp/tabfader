import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyVolumeToMedia, watchExtensionLiveness } from './content';

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
    document.dispatchEvent(new CustomEvent('tabtune:alive'));
    vi.advanceTimersByTime(10_000);
    expect(onUninstalled).not.toHaveBeenCalled();
  });
});
