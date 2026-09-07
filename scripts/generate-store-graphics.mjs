import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderIconPngs } from './render-icons.mjs';
import { renderHtmlToPng } from './render-png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON_SVG = path.join(ROOT, 'assets', 'icon.svg');
const OUT_DIR = path.join(ROOT, 'docs', 'store');

const svg = await readFile(ICON_SVG, 'utf8');
await mkdir(OUT_DIR, { recursive: true });

// Store icon: the Chrome Web Store wants 96 px of artwork inside the 128 px canvas
// (16 px of transparent padding), while the manifest icon stays full-bleed.
const shapes = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const paddedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><g transform="translate(2 2) scale(0.75)">${shapes}</g></svg>`;
const [storeIcon] = (await renderIconPngs(paddedSvg, [128])).values();
await writeFile(path.join(OUT_DIR, 'icon-128.png'), storeIcon);

// Promo tiles: mark + wordmark only. CWS guidance asks for saturated color, a filled
// region and as little text as possible.
function tileHtml({ width, height, iconSize, wordSize, gap, echoSize }) {
  const shadowY = Math.round(iconSize * 0.08);
  const shadowBlur = Math.round(iconSize * 0.22);
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&display=swap">
<style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}
body{background:linear-gradient(135deg,#0e1220 0%,#16264a 100%);display:flex;align-items:center;justify-content:center;gap:${gap}px;position:relative;font-family:"Bricolage Grotesque","Segoe UI",system-ui,sans-serif}
.echo{position:absolute;right:${-Math.round(echoSize * 0.22)}px;top:50%;transform:translateY(-50%) rotate(-8deg);width:${echoSize}px;height:${echoSize}px;opacity:.09}
.mark{position:relative;width:${iconSize}px;height:${iconSize}px;filter:drop-shadow(0 ${shadowY}px ${shadowBlur}px rgba(0,0,0,.5))}
.word{position:relative;color:#fff;font-weight:700;font-size:${wordSize}px;letter-spacing:-.025em;line-height:1}
svg{display:block;width:100%;height:100%}
</style></head><body>
<div class="echo">${svg}</div>
<div class="mark">${svg}</div>
<div class="word">TabFader</div>
</body></html>`;
}

const TILES = [
  { file: 'promo-440x280.png', width: 440, height: 280, iconSize: 118, wordSize: 58, gap: 26, echoSize: 300 },
  { file: 'marquee-1400x560.png', width: 1400, height: 560, iconSize: 236, wordSize: 124, gap: 52, echoSize: 620 },
];

for (const tile of TILES) {
  const png = await renderHtmlToPng(tileHtml(tile), { width: tile.width, height: tile.height });
  await writeFile(path.join(OUT_DIR, tile.file), png);
}

console.log(
  `store graphics: wrote icon-128.png, ${TILES.map((t) => t.file).join(', ')} to ${path.relative(ROOT, OUT_DIR)}`,
);
