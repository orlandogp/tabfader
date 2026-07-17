export const DEFAULT_VOLUME = 1.0;

export function clampVolume(v: number): number {
  if (Number.isNaN(v)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, v));
}

export function percentToUnit(p: number): number {
  return clampVolume(p / 100);
}

export function unitToPercent(v: number): number {
  return Math.round(clampVolume(v) * 100);
}
