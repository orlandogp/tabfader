import { describe, it, expect } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

describe('toolchain', () => {
  it('runs vitest and exposes fakeBrowser', () => {
    expect(typeof fakeBrowser.runtime.id).toBe('string');
  });
});
