import { unitToPercent, percentToUnit } from '@/lib/volume';

interface Props {
  value: number; // unit 0..1
  onChange: (unit: number) => void;
}

export function VolumeSlider({ value, onChange }: Props) {
  return (
    <div class="volume-slider">
      <input
        type="range"
        min={0}
        max={100}
        value={unitToPercent(value)}
        aria-label="Volume"
        onInput={(e) => onChange(percentToUnit(Number((e.target as HTMLInputElement).value)))}
      />
      <span class="pct">{unitToPercent(value)}%</span>
    </div>
  );
}
