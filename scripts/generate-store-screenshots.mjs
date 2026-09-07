// Usage: node scripts/generate-store-screenshots.mjs <opt-in|granted>
//
// Loads the built extension into a real Chromium, opens public sites that play
// audio, captures the actual popup at 2x, and composes each capture onto a
// 1280x800 canvas for the Chrome Web Store.
//
//   opt-in   normal build: rows show the "Control volume here" button -> screenshots 1 and 2
//   granted  `wxt build --mode screenshots` (host permission pre-granted): rows show sliders -> screenshot 3
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { renderHtmlToPng } from './render-png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'docs', 'store');
const RAW_DIR = path.join(ROOT, '.output', 'store-raw');
const PHASE = process.argv[2] ?? 'opt-in';
// NOTE: WXT writes non-production modes to their own folder, so the pre-granted build
// never overwrites the production output that `pnpm zip` and the e2e suite use.
const EXT_PATH = path.join(ROOT, '.output', PHASE === 'granted' ? 'chrome-mv3-screenshots' : 'chrome-mv3');
const WANTED_TABS = 3;

// Real pages give the popup real titles and favicons. Their own players are not
// used: site bot-detection and consent walls make playback flaky under
// automation, so each tab gets a quiet Web Audio oscillator instead. Chrome
// flags the tab as audible either way, and no CSP can block Web Audio.
const SITES = [
  { name: 'YouTube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
  { name: 'Spotify', url: 'https://open.spotify.com/' },
  { name: 'SoundCloud', url: 'https://soundcloud.com/' },
  { name: 'Twitch', url: 'https://www.twitch.tv/' },
  { name: 'Bandcamp', url: 'https://bandcamp.com/' },
];

async function startTone(page) {
  await page.evaluate(() => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 220;
    gain.gain.value = 0.03;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    return ctx.resume();
  });
}

const SHOTS = {
  'opt-in': [
    {
      file: 'screenshot-1.png',
      headline: 'Every tab that is making sound, in one place.',
      sub: 'TabFader lists what is playing right now. Nothing to configure.',
      prepare: async () => {},
    },
    {
      file: 'screenshot-2.png',
      headline: 'Mute any tab instantly.',
      sub: 'One click per tab, or all at once. No website access needed.',
      prepare: async (popup) => {
        await popup.locator('.tab-row .mute').first().click();
        await popup.getByText(/muted/i).first().waitFor({ timeout: 5_000 });
      },
    },
  ],
  granted: [
    {
      file: 'screenshot-3.png',
      headline: 'Fine volume per site, only where you allow it.',
      sub: 'Unlock a slider for a site with one prompt. TabFader remembers your level.',
      prepare: async (popup) => {
        const slider = popup.locator('input[type=range]').first();
        await slider.waitFor({ timeout: 5_000 });
        await slider.fill('40');
        await popup.getByText('40%').waitFor({ timeout: 5_000 });
      },
    },
  ],
};

const shots = SHOTS[PHASE];
if (!shots) {
  console.error(`unknown phase "${PHASE}"; use opt-in or granted`);
  process.exit(1);
}

const context = await chromium.launchPersistentContext('', {
  headless: false,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

try {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = worker.url().split('/')[2];

  // The popup page has the extension's chrome.* APIs, so it doubles as our probe
  // for which tabs Chrome currently reports as audible.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const audibleHosts = () =>
    popup.evaluate(() => chrome.tabs.query({ audible: true }).then((tabs) => tabs.map((t) => new URL(t.url).host)));

  const playing = [];
  for (const site of SITES) {
    if (playing.length >= WANTED_TABS) break;
    const page = await context.newPage();
    try {
      await page.goto(site.url, { waitUntil: 'load', timeout: 30_000 });
      await startTone(page);
      const host = new URL(site.url).host;
      const deadline = Date.now() + 20_000;
      let audible = false;
      while (Date.now() < deadline && !audible) {
        audible = (await audibleHosts()).includes(host);
        if (!audible) await page.waitForTimeout(500);
      }
      if (audible) {
        playing.push(site.name);
        console.log(`audible: ${site.name}`);
      } else {
        console.log(`skipped (never audible): ${site.name}`);
        await page.close();
      }
    } catch (error) {
      console.log(`skipped (${error.message.split('\n')[0]}): ${site.name}`);
      await page.close();
    }
  }
  if (playing.length < 2) throw new Error(`only ${playing.length} site(s) became audible; need at least 2`);

  console.log(`audible hosts before capture: ${(await audibleHosts()).join(', ') || 'none'}`);
  await popup.bringToFront();
  // The popup fetches its list on mount, so reload until the rows show up.
  const rows = popup.locator('.tab-row');
  const minRows = Math.min(playing.length, 2);
  const listDeadline = Date.now() + 30_000;
  let rowCount = 0;
  while (Date.now() < listDeadline) {
    await popup.reload();
    await popup.waitForTimeout(700);
    rowCount = await rows.count();
    if (rowCount >= playing.length) break;
    if (rowCount >= minRows && Date.now() > listDeadline - 15_000) break;
  }
  if (rowCount < minRows) {
    const audible = await popup.evaluate(() =>
      chrome.tabs.query({ audible: true }).then((tabs) => tabs.map((t) => `${t.title} <${t.url}>`)),
    );
    const listed = await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'list' }));
    throw new Error(
      `popup shows ${rowCount} row(s) for ${playing.length} audible site(s)\naudible: ${JSON.stringify(audible)}\nlist: ${JSON.stringify(listed)}`,
    );
  }
  console.log(`popup rows: ${rowCount}`);

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(RAW_DIR, { recursive: true });
  const icon = await readFile(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');

  for (const shot of shots) {
    await shot.prepare(popup);
    await popup.waitForTimeout(300);
    const raw = await popup.locator('.panel').screenshot({ type: 'png' });
    await writeFile(path.join(RAW_DIR, `${PHASE}-${shot.file}`), raw);
    const png = await renderHtmlToPng(canvasHtml({ ...shot, icon, popupPng: raw }), { width: 1280, height: 800 });
    await writeFile(path.join(OUT_DIR, shot.file), png);
    console.log(`wrote ${shot.file} (${playing.join(', ')})`);
  }
} finally {
  await context.close();
}

function canvasHtml({ headline, sub, icon, popupPng }) {
  const src = `data:image/png;base64,${popupPng.toString('base64')}`;
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700&family=IBM+Plex+Sans:wght@400;500&display=swap">
<style>
html,body{margin:0;width:1280px;height:800px;overflow:hidden}
body{background:linear-gradient(135deg,#0e1220 0%,#16264a 100%);display:grid;grid-template-columns:600px 1fr;align-items:center;font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;color:#fff}
.copy{padding:0 0 0 88px;display:grid;gap:22px}
.brand{display:flex;align-items:center;gap:12px;font:700 22px/1 "Bricolage Grotesque","Segoe UI",system-ui,sans-serif;letter-spacing:-.01em;opacity:.9}
.brand svg{width:30px;height:30px;display:block}
h1{margin:0;font:700 56px/1.06 "Bricolage Grotesque","Segoe UI",system-ui,sans-serif;letter-spacing:-.025em;text-wrap:balance}
p{margin:0;font-size:22px;line-height:1.45;color:rgba(255,255,255,.78);max-width:30ch}
.shot{display:flex;justify-content:center;align-items:center;padding-right:72px}
.shot img{width:440px;height:auto;max-height:720px;object-fit:contain;object-position:top;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}
</style></head><body>
<div class="copy"><div class="brand">${icon}<span>TabFader</span></div><h1>${headline}</h1><p>${sub}</p></div>
<div class="shot"><img src="${src}" alt=""></div>
</body></html>`;
}
