import type { AudibleTab } from '@/lib/types';
import { FaderMark } from './FaderMark';
import { VolumeSlider } from './VolumeSlider';

interface Props {
  tab: AudibleTab;
  granted: boolean;
  volume: number;
  onToggleMute: () => void;
  onUnlock: () => void;
  onVolume: (unit: number) => void;
}

function statusSuffix(tab: AudibleTab): string {
  if (tab.muted) return ' · muted';
  if (!tab.audible) return ' · silent';
  return '';
}

export function TabRow({ tab, granted, volume, onToggleMute, onUnlock, onVolume }: Props) {
  const quiet = !tab.audible && !tab.muted;
  return (
    <div class={quiet ? 'tab-row quiet' : 'tab-row'}>
      {tab.favIconUrl ? <img class="fav" src={tab.favIconUrl} alt="" width={18} height={18} /> : <span class="fav" />}
      <div class="meta">
        <div class="title">{tab.title}</div>
        <div class="origin">{tab.origin}{statusSuffix(tab)}</div>
        {granted
          ? <VolumeSlider value={volume} onChange={onVolume} />
          : (
            <button class="unlock" onClick={onUnlock}>
              <FaderMark variant="glyph" size={12} /> Control volume here →
            </button>
          )}
      </div>
      <button class="mute" aria-label={`${tab.muted ? 'Unmute' : 'Mute'} ${tab.title}`} onClick={onToggleMute}>
        {tab.muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
