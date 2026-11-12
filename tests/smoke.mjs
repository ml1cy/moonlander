#!/usr/bin/env node
// Headless smoke test for both builds.   npm test   (builds first)
// Needs Playwright: `npm install` then `npx playwright install chromium` once.
//
// Serves dist/ over HTTP (the web shell fetches settings.json, which file:// blocks),
// loads each target, drives it through the engine's debug hooks, and fails on any
// page error. Screenshots go to test-results/.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'test-results');
await mkdir(out, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif' };
const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  try { res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(await readFile(join(dist, p))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) failures++; };

const browser = await chromium.launch();
async function open(path) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // The web font is optional (falls back to monospace), so ignore font requests that can't load offline.
  page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push('request failed: ' + r.url()); });
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + path);
  await page.waitForTimeout(1200);
  return { page, errors };
}
const steps = (page, n) => page.evaluate(n => { for (let i = 0; i < n; i++) window.__moonLanderStep(1 / 60); }, n);

// ---------------------------------------------------------------- wallpaper
console.log('wallpaper');
{
  const { page, errors } = await open('/wallpaper/index.html');
  check(await page.evaluate(() => window.MoonLander?.mode) === 'wallpaper', 'engine boots in wallpaper mode');
  // Feed every property the way Lively does on load.
  const props = JSON.parse(await readFile(join(dist, 'wallpaper/LivelyProperties.json'), 'utf8'));
  await page.evaluate(props => {
    for (const [k, c] of Object.entries(props)) if (c.type !== 'label' && c.type !== 'button') window.livelyPropertyListener(k, c.value);
    window.livelyWallpaperPlaybackChanged(JSON.stringify({ IsPaused: true }));
    window.livelyWallpaperPlaybackChanged(JSON.stringify({ IsPaused: false }));
  }, props);
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.__moonLanderDebug.state().mode)) === 'auto', 'idle loop running on autopilot');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600); await page.keyboard.up('ArrowUp');
  check((await page.evaluate(() => window.__moonLanderDebug.state().mode)) === 'manual', 'arrow key takes control');
  await page.screenshot({ path: join(out, 'wallpaper.png') });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.close();
}

// ---------------------------------------------------------------- web game
console.log('web game');
{
  const { page, errors } = await open('/web/index.html');
  check(await page.evaluate(() => window.MoonLander?.mode) === 'game', 'engine boots in game mode');
  check(await page.isVisible('#title'), 'title screen shown');
  const rows = await page.locator('#settingsBody .set-row').count();
  check(rows > 20, `settings drawer generated from settings.json (${rows} controls)`);
  await page.screenshot({ path: join(out, 'web-title.png') });

  await page.click('#play');
  await page.waitForTimeout(300);
  check(!(await page.isVisible('#title')), 'Play hides the title');
  check((await page.evaluate(() => window.__moonLanderDebug.state().mode)) === 'manual', 'Play hands the ship to the player');
  check((await page.evaluate(() => window.__moonLanderDebug.econ().autopilot)) === false, 'autopilot starts off in the game');

  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(900); await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: join(out, 'web-flying.png') });

  await page.keyboard.press('Escape');
  check(await page.isVisible('#pause') && await page.evaluate(() => window.MoonLander.paused), 'Esc pauses');
  await page.click('#resume');
  check(!(await page.evaluate(() => window.MoonLander.paused)), 'Resume unpauses');

  await page.keyboard.press('Tab');
  check(await page.evaluate(() => window.MoonLander.menuOpen), 'Tab opens upgrades menu');
  await page.screenshot({ path: join(out, 'web-upgrades.png') });
  await page.keyboard.press('Escape');
  check(!(await page.evaluate(() => window.MoonLander.menuOpen)), 'Esc closes upgrades menu (and does not pause)');
  check(!(await page.evaluate(() => window.MoonLander.paused)), 'still unpaused');

  // a setting changed in the drawer reaches the engine and is remembered
  await page.click('#gear');
  await page.selectOption('#set-flameStyle', '1');
  await page.click('#closeSettings');
  await page.reload(); await page.waitForTimeout(1200);
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('moonLander.settings.v1')).flameStyle)) === 1, 'settings persist across reload');

  // enemies + easter egg hooks don't throw
  await page.click('#play');
  await page.evaluate(() => { const d = window.__moonLanderDebug; d.sputniks(3); d.ufo(true); d.nuke(); d.cow(); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(out, 'web-action.png') });
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await page.close();
}

// ---------------------------------------------------------------- touch layout
console.log('touch');
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + '/web/index.html'); await page.waitForTimeout(1200);
  await page.tap('#play'); await page.waitForTimeout(200);
  check(await page.isVisible('#touch'), 'touch controls shown on a phone');
  await page.screenshot({ path: join(out, 'web-phone.png') });
  check(errors.length === 0, 'no page errors on phone' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
