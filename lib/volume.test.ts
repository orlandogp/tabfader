import { describe, it, expect } from 'vitest';
import { clampVolume, percentToUnit, unitToPercent, DEFAULT_VOLUME } from './volume';

describe('clampVolume', () => {
  it('clamps out-of-range values into [0,1]', () => {
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(0.42)).toBe(0.42);
  });
  it('returns DEFAULT_VOLUME for NaN', () => {
    expect(clampVolume(NaN)).toBe(DEFAULT_VOLUME);
  });
});

describe('percentToUnit / unitToPercent', () => {
  it('round-trips whole percentages', () => {
    expect(percentToUnit(65)).toBeCloseTo(0.65, 5);
    expect(unitToPercent(0.65)).toBe(65);
  });
  it('clamps beyond bounds (no boost above 100%)', () => {
    expect(percentToUnit(150)).toBe(1);
    expect(unitToPercent(2)).toBe(100);
  });
  it('clamps negative percent to 0', () => {
    expect(percentToUnit(-50)).toBe(0);
  });
});

describe('DEFAULT_VOLUME', () => {
  it('is full volume', () => {
    expect(DEFAULT_VOLUME).toBe(1.0);
  });
});
