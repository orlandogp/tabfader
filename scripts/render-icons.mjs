import { chromium } from 'playwright';

/**
 * Rasterize an SVG string into one transparent PNG per size, using the same
 * Chromium that runs the component tests, so no extra image dependency is needed.
 * @param {string} svg
 * @param {number[]} sizes
 * @returns {Promise<Map<number, Buffer>>}
 */
export async function renderIconPngs(svg, sizes) {
  const browser = await chromium.launch();
  try {
    const pngs = new Map();
    for (const size of sizes) {
      const page = await browser.newPage({
        viewport: { width: size, height: size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
      );
      pngs.set(size, await page.screenshot({ omitBackground: true, type: 'png' }));
      await page.close();
    }
    return pngs;
  } finally {
    await browser.close();
  }
}
