import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AudibleTab } from '@/lib/types';
import { sendToBackground } from '@/lib/messages';
import { hasOriginPermission, requestOriginPermission } from '@/lib/permissions';
import { getSiteVolume } from '@/lib/storage';
import { DEFAULT_VOLUME } from '@/lib/volume';
import { TabRow } from './components/TabRow';
import { DonationFooter } from './components/DonationFooter';
import { FaderMark } from './components/FaderMark';
import './style.css';

interface TabChangeInfo {
  audible?: boolean;
  mutedInfo?: unknown;
  title?: string;
}

interface RowState { granted: boolean; volume: number }

interface PanelState {
  tabs: AudibleTab[];
  rowState: Record<string, RowState>;
  /** False until the first list arrives, so "Nothing is playing" is never a guess. */
  loaded: boolean;
}

async function loadRowState(origin: string): Promise<[string, RowState]> {
  try {
    const [granted, volume] = await Promise.all([hasOriginPermission(origin), getSiteVolume(origin)]);
    return [origin, { granted, volume }];
  } catch {
    // NOTE: one origin the browser refuses to look up must not blank the whole panel:
    // its row still offers mute and the opt-in.
    return [origin, { granted: false, volume: DEFAULT_VOLUME }];
  }
}

export function App({ donateUrl, repoUrl }: { donateUrl: string; repoUrl?: string }) {
  const [{ tabs, rowState, loaded }, setPanel] = useState<PanelState>({ tabs: [], rowState: {}, loaded: false });
  const shownTabIds = useRef<number[]>([]);
  const lastRequest = useRef(0);
  const lastApplied = useRef(0);
  // NOTE: Volumes the user set whose storage write has not been confirmed yet, per origin.
  const pendingVolumes = useRef(new Map<string, { volume: number; writes: number }>());

  // NOTE: Tab events fire in bursts and every refresh is async, so: (1) list + row state land
  // in ONE render (rows never show a placeholder state first), (2) a response older than
  // the one already on screen is dropped, (3) the rows on screen are kept even after
  // they go quiet, so intermittent audio does not make them blink in and out.
  async function refresh() {
    const request = ++lastRequest.current;
    const list = await sendToBackground({ type: 'list', keep: shownTabIds.current }).catch(() => undefined);
    // NOTE: no list (the background failed or is restarting): keep what is on screen; the
    // next tab event retries.
    if (!Array.isArray(list)) return;
    const origins = [...new Set(list.map((t) => t.origin))];
    const rowState = Object.fromEntries(await Promise.all(origins.map(loadRowState)));
    if (request < lastApplied.current) return;
    lastApplied.current = request;
    // NOTE: storage may not hold the slider's latest value yet; what the user just set wins.
    for (const [origin, pending] of pendingVolumes.current) {
      if (rowState[origin]) rowState[origin] = { ...rowState[origin], volume: pending.volume };
    }
    shownTabIds.current = list.map((t) => t.id);
    setPanel({ tabs: list, rowState, loaded: true });
  }

  useEffect(() => {
    refresh();
    // The popup page has direct chrome API access, so while it's open we keep
    // the list live instead of only snapshotting it once on mount.
    const onTabUpdated = (_tabId: number, changeInfo: TabChangeInfo) => {
      if (changeInfo.audible !== undefined || changeInfo.mutedInfo !== undefined || changeInfo.title !== undefined) {
        refresh();
      }
    };
    const onTabRemoved = () => refresh();
    browser.tabs.onUpdated.addListener(onTabUpdated);
    browser.tabs.onRemoved.addListener(onTabRemoved);
    return () => {
      browser.tabs.onUpdated.removeListener(onTabUpdated);
      browser.tabs.onRemoved.removeListener(onTabRemoved);
    };
  }, []);

  async function toggleMute(t: AudibleTab) {
    await sendToBackground({ type: 'toggleMute', tabId: t.id, muted: !t.muted });
    refresh();
  }

  async function unlock(t: AudibleTab) {
    const granted = await requestOriginPermission(t.origin); // direct: user gesture
    if (granted) {
      await sendToBackground({ type: 'grantSite', tabId: t.id, origin: t.origin });
      refresh();
    }
  }

  async function setVolume(t: AudibleTab, volume: number) {
    setPanel((p) => ({ ...p, rowState: { ...p.rowState, [t.origin]: { ...p.rowState[t.origin], volume } } }));
    const pending = pendingVolumes.current;
    pending.set(t.origin, { volume, writes: (pending.get(t.origin)?.writes ?? 0) + 1 });
    try {
      await sendToBackground({ type: 'setVolume', tabId: t.id, origin: t.origin, volume });
    } finally {
      const entry = pending.get(t.origin);
      if (entry && --entry.writes === 0) pending.delete(t.origin);
    }
  }

  // Toggle target for the master button: if everything is already muted, the
  // button flips to "Unmute all" (user-requested during field testing).
  const allMuted = tabs.length > 0 && tabs.every((t) => t.muted);

  return (
    <div class="panel">
      <header class="header">
        <FaderMark size={18} />
        <span class="name">TabFader</span>
        <button
          class="all-mute"
          onClick={() =>
            sendToBackground({ type: 'muteAll', muted: !allMuted, keep: shownTabIds.current }).then(refresh)
          }
        >
          {allMuted ? '🔊 Unmute all' : '🔇 Mute all'}
        </button>
      </header>

      <div class="section-label">🟢 Playing now</div>
      {loaded && tabs.length === 0 && <div class="empty">Nothing is playing right now.</div>}
      {tabs.map((t) => (
        <TabRow
          key={t.id}
          tab={t}
          granted={rowState[t.origin].granted}
          volume={rowState[t.origin].volume}
          onToggleMute={() => toggleMute(t)}
          onUnlock={() => unlock(t)}
          onVolume={(v) => setVolume(t, v)}
        />
      ))}

      <DonationFooter donateUrl={donateUrl} repoUrl={repoUrl} />
    </div>
  );
}
