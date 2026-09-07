import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Chrome renders the popup in the browser's preferred scheme out of the `color-scheme` list
// and, when no preference can be read, in the first one listed. Light must stay first: that
// is the agreed fallback, and no browser emulation can exercise it directly.
describe('popup color scheme', () => {
  it('follows the browser theme and falls back to light', () => {
    const css = readFileSync(path.resolve(__dirname, 'style.css'), 'utf8');
    expect(css).toMatch(/:root\s*\{[^}]*color-scheme:\s*light dark\s*;/);
    expect(css).toMatch(/body\s*\{[^}]*background:\s*Canvas\s*;[^}]*color:\s*CanvasText\s*;/);
  });
});
