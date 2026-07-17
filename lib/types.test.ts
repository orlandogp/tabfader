import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from './types';

describe('DEFAULT_SETTINGS', () => {
  it('enables shortcuts and does not hide donation by default', () => {
    expect(DEFAULT_SETTINGS).toEqual({ shortcutsEnabled: true, donationDismissed: false });
  });
});
