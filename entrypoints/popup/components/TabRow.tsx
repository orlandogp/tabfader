import type { AudibleTab } from '@/lib/types';
import { VolumeSlider } from './VolumeSlider';

interface Props {
  tab: AudibleTab;
  granted: boolean;
  volume: number;
  onToggleMute: () => void;
  onUnlock: () => void;
  onVolume: (unit: number) => void;
}

export function TabRow({ tab, granted, volume, onToggleMute, onUnlock, onVolume }: Props) {
  return (
    <div class="tab-row">
      {tab.favIconUrl ? <img class="fav" src={tab.favIconUrl} alt="" width={18} height={18} /> : <span class="fav" />}
      <div class="meta">
        <div class="title">{tab.title}</div>
        <div class="origin">{tab.origin}{tab.muted ? ' · muted' : ''}</div>
        {granted
          ? <VolumeSlider value={volume} onChange={onVolume} />
          : <button class="unlock" onClick={onUnlock}>🎚️ Control volume here →</button>}
      </div>
      <button class="mute" aria-label={tab.muted ? 'Unmute' : 'Mute'} onClick={onToggleMute}>
        {tab.muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
