import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIconPngs } from './render-icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'public', 'icon');
// NOTE: WXT auto-registers public/icon/<size>.png as the manifest and action icons.
// 16/32 are the toolbar at 1x/2x, 48 the extensions page, 128 the store listing.
const SIZES = [16, 32, 48, 128];

const svg = await readFile(SOURCE, 'utf8');
const pngs = await renderIconPngs(svg, SIZES);
await mkdir(OUT_DIR, { recursive: true });
for (const [size, png] of pngs) {
  await writeFile(path.join(OUT_DIR, `${size}.png`), png);
}
console.log(`icons: wrote ${SIZES.map((size) => `${size}.png`).join(', ')} to ${path.relative(ROOT, OUT_DIR)}`);
