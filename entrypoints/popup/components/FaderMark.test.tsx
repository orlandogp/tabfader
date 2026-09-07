import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { FaderMark } from './FaderMark';

// The popup must show the same mark that ships as the extension icon, so the
// geometry below is read from the icon source instead of being hard-coded here.
const ICON_SVG = readFileSync(path.resolve(__dirname, '../../../assets/icon.svg'), 'utf8');

function rectGeometry(markup: string) {
  return [...markup.matchAll(/<rect\b([^>]*)\/?>/g)].map(([, attrs]) => {
    const pick = (name: string) => new RegExp(`\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
    return { x: pick('x'), y: pick('y'), width: pick('width'), height: pick('height'), rx: pick('rx') };
  });
}

describe('FaderMark', () => {
  it('renders the tile variant with exactly the icon source geometry', () => {
    const { container } = render(<FaderMark />);

    expect(rectGeometry(container.innerHTML)).toEqual(rectGeometry(ICON_SVG));
  });

  it('renders the glyph variant without the tile, in the current text color', () => {
    const { container } = render(<FaderMark variant="glyph" size={12} />);

    const rects = [...container.querySelectorAll('rect')];
    expect(rects).toHaveLength(2);
    expect(rects.every((r) => r.getAttribute('fill') === 'currentColor')).toBe(true);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('12');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
