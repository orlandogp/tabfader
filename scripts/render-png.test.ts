// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PNG_SIGNATURE, readPngHeader } from '../test/png-header';
import { renderHtmlToPng } from './render-png.mjs';

describe('renderHtmlToPng', () => {
  it('renders html to a png of exactly the requested css size', async () => {
    const png = await renderHtmlToPng('<div style="width:100%;height:100%;background:#2f6fed"></div>', {
      width: 440,
      height: 280,
    });

    const header = readPngHeader(png);
    expect(header.signature).toBe(PNG_SIGNATURE);
    expect(header.width).toBe(440);
    expect(header.height).toBe(280);
  }, 30_000);

  it('multiplies the pixel size by deviceScaleFactor for hi-dpi captures', async () => {
    const png = await renderHtmlToPng('<p>hi</p>', { width: 100, height: 50, deviceScaleFactor: 2 });

    const header = readPngHeader(png);
    expect(header.width).toBe(200);
    expect(header.height).toBe(100);
  }, 30_000);
});
