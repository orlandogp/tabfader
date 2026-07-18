import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import type { AudibleTab } from '@/lib/types';
import { sendToBackground } from '@/lib/messages';
import { hasOriginPermission, requestOriginPermission } from '@/lib/permissions';
import { getSiteVolume } from '@/lib/storage';
import { TabRow } from './components/TabRow';
import { DonationFooter } from './components/DonationFooter';
import './style.css';

interface TabChangeInfo {
  audible?: boolean;
  mutedInfo?: unknown;
  title?: string;
}

interface RowState { granted: boolean; volume: number }

export function App({ donateUrl }: { donateUrl: string }) {
  const [tabs, setTabs] = useState<AudibleTab[]>([]);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  async function refresh() {
    const list = (await sendToBackground({ type: 'list' })) as AudibleTab[];
    setTabs(list);
    const entries: Record<string, RowState> = {};
    for (const t of list) {
      entries[t.origin] = {
        granted: await hasOriginPermission(t.origin),
        volume: await getSiteVolume(t.origin),
      };
    }
    setRowState(entries);
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
    setRowState((s) => ({ ...s, [t.origin]: { ...s[t.origin], volume } }));
    await sendToBackground({ type: 'setVolume', tabId: t.id, origin: t.origin, volume });
  }

  // Toggle target for the master button: if everything is already muted, the
  // button flips to "Unmute all" (user-requested during field testing).
  const allMuted = tabs.length > 0 && tabs.every((t) => t.muted);

  return (
    <div class="panel">
      <header class="header">
        <span class="logo">🎚️</span>
        <span class="name">TabTune</span>
        <button
          class="all-mute"
          onClick={() => sendToBackground({ type: 'muteAll', muted: !allMuted }).then(refresh)}
        >
          {allMuted ? '🔊 Unmute all' : '🔇 Mute all'}
        </button>
      </header>

      <div class="section-label">🟢 Playing now</div>
      {tabs.length === 0 && <div class="empty">Nothing is playing right now.</div>}
      {tabs.map((t) => (
        <TabRow
          key={t.id}
          tab={t}
          granted={rowState[t.origin]?.granted ?? false}
          volume={rowState[t.origin]?.volume ?? 1}
          onToggleMute={() => toggleMute(t)}
          onUnlock={() => unlock(t)}
          onVolume={(v) => setVolume(t, v)}
        />
      ))}

      <DonationFooter donateUrl={donateUrl} />
    </div>
  );
}
