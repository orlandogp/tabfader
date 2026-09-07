// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PNG_COLOR_TYPE_RGBA, PNG_SIGNATURE, readPngHeader } from '../test/png-header';
import { renderIconPngs } from './render-icons.mjs';

const SQUARE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="#2f6fed"/></svg>';

describe('renderIconPngs', () => {
  it('renders one RGBA png per requested size at exact pixel dimensions', async () => {
    const pngs = await renderIconPngs(SQUARE_SVG, [16, 48]);

    expect([...pngs.keys()]).toEqual([16, 48]);
    for (const [size, png] of pngs) {
      const header = readPngHeader(png);
      expect(header.signature).toBe(PNG_SIGNATURE);
      expect(header.width).toBe(size);
      expect(header.height).toBe(size);
      // NOTE: rounded tile corners must stay transparent, so the encoder has to keep alpha.
      expect(header.colorType).toBe(PNG_COLOR_TYPE_RGBA);
    }
  }, 30_000);
});
