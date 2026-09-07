import { chromium } from 'playwright';

/**
 * Render an HTML document to a PNG of exactly `width` x `height` CSS pixels
 * (times `deviceScaleFactor` in device pixels). Waits for network idle and web
 * fonts so Google Fonts wordmarks render before the capture.
 * @param {string} html
 * @param {{ width: number, height: number, deviceScaleFactor?: number, omitBackground?: boolean }} options
 * @returns {Promise<Buffer>}
 */
export async function renderHtmlToPng(html, { width, height, deviceScaleFactor = 1, omitBackground = false }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'png', omitBackground, clip: { x: 0, y: 0, width, height } });
  } finally {
    await browser.close();
  }
}
