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

  // hangar: tabs, buying weapons and ships, cheats
  const econ = () => page.evaluate(() => window.__moonLanderDebug.econ());
  await page.evaluate(() => window.__moonLanderDebug.credits(5000));
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  check((await econ()).menuTab === 1, 'arrow keys switch hangar tabs');
  await page.keyboard.press('Digit3');
  let e = await econ();
  check(e.weapon === 'rail' && e.credits === 4700, 'buying a weapon equips it and costs credits');
  await page.screenshot({ path: join(out, 'web-weapons.png') });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Digit4');
  check((await econ()).ship === 'gunship', 'buying a ship equips it');
  await page.screenshot({ path: join(out, 'web-ships.png') });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Digit5');
  e = await econ();
  check(e.world === 'mars' && !e.menuOpen, 'buying a world travels there and closes the hangar');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, 'web-mars.png') });

  // the cheats tab is hidden until Ctrl+Alt+Shift+G
  check(!(await econ()).tabs.includes('CHEATS'), 'cheats tab is hidden by default');
  await page.keyboard.press('Control+Alt+Shift+KeyG');
  e = await econ();
  check(e.cheatsUnlocked && e.tabs.includes('CHEATS') && !e.menuOpen, 'Ctrl+Alt+Shift+G unlocks the cheats tab');
  check((await page.evaluate(() => window.__moonLanderDebug.state().toasts)).includes('CHEATS UNLOCKED'), 'shows the CHEATS UNLOCKED popup');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Digit2');
  check((await econ()).cheat.god === true, 'cheats tab toggles god mode');
  await page.screenshot({ path: join(out, 'web-cheats.png') });
  await page.keyboard.press('Digit2');
  await page.keyboard.press('Digit1');
  check((await econ()).credits === 4150 + 1000, 'cheat adds credits');
  await page.keyboard.press('Escape');
  await page.keyboard.press('KeyR');
  check((await econ()).weapon === 'laser', 'R cycles through owned weapons');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('moonLander.save.v1')).weapons.includes('rail')), 'owned weapons are saved');

  // every world builds and runs
  const visited = await page.evaluate(() => {
    const d = window.__moonLanderDebug, seen = [];
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'io', 'titan', 'miranda', 'triton', 'pluto', 'moon']) {
      d.world(id);
      for (let i = 0; i < 3; i++) window.__moonLanderStep(1 / 60);
      seen.push(window.MoonLander.world);
    }
    return seen;
  });
  check(visited.length === 10 && visited[9] === 'moon' && visited[5] === 'titan', 'all ten worlds build and run');
  await page.keyboard.press('ArrowUp');

  // every enemy type spawns, runs, shoots and can be destroyed
  const foeRun = await page.evaluate(() => {
    const d = window.__moonLanderDebug, r = { types: d.foeTypes(), spawned: 0, cleared: 0 };
    window.MoonLander.setProperty('bosses', false);      // keep the boss out of this test
    d.cheat('god', true);
    for (const type of r.types) {
      const s = d.state();
      d.place(s.W * 0.5, s.H * 0.45, 0, 0, 0, 0, true);
      d.foes(type, 2);
      if (d.foeList().length === 2) r.spawned++;
      for (let i = 0; i < 400; i++) window.__moonLanderStep(1 / 60);
      for (let i = 0; i < 12; i++) d.hitFoe();
      if (d.foeList().length === 0) r.cleared++;
    }
    r.aliens = d.state().score.aliens;
    window.MoonLander.setProperty('bosses', true);
    d.cheat('god', false);
    return r;
  });
  check(foeRun.types.length === 10 && foeRun.spawned === 10 && foeRun.cleared === 10 && foeRun.aliens > 0,
    'all ten enemy types spawn, fight and die ' + JSON.stringify({ spawned: foeRun.spawned, cleared: foeRun.cleared, aliens: foeRun.aliens }));

  // the camera zooms out with altitude and back in near the ground
  const zoomRun = await page.evaluate(() => {
    const d = window.__moonLanderDebug, r = {};
    const step = n => { for (let i = 0; i < n; i++) window.__moonLanderStep(1 / 60); };
    window.MoonLander.setProperty('natives', false); window.MoonLander.setProperty('sputniks', false);
    d.cheat('god', true);
    let s = d.state();
    for (let i = 0; i < 90; i++) { d.place(s.W * 0.5, -s.CEIL * 0.8, 0, 0, 0, 0, true); step(1); }
    for (let i = 0; i < 120; i++) { d.place(s.W * 0.5, -s.CEIL * 0.8, 0, 0, 0, 0, true); step(1); }
    s = d.state();
    r.high = s.zoom; r.alt = s.alt; r.full = s.W / s.WW; r.camY = s.cam.y;
    r.density = s.density; r.ps = s.PS; r.sharp = s.canvasW === s.W * s.density;
    for (let i = 0; i < 60; i++) { d.place(s.W * 0.5, s.H * 0.2, 0, 0, 0, 0, true); step(1); }
    r.mid = d.state().zoom;
    for (let i = 0; i < 300; i++) { d.place(s.W * 0.5, s.H * 0.5, 0, 0, 0, 0, true); step(1); }
    r.low = d.state().zoom; r.lowDensity = d.state().density; r.lowW = d.state().canvasW === d.state().W;
    window.MoonLander.setProperty('natives', true); window.MoonLander.setProperty('sputniks', true);
    d.cheat('god', false);
    return r;
  });
  check(Math.abs(zoomRun.high - zoomRun.full) < 0.01 && Math.abs(zoomRun.camY) < 1, `whole arena is in view at the top of the sky (zoom ${zoomRun.high.toFixed(2)})`);
  check(zoomRun.mid > zoomRun.high && zoomRun.mid < 1 && zoomRun.low === 1, `zoom follows altitude (${zoomRun.mid.toFixed(2)} part-way) and is back to 1 near the ground`);

  check(zoomRun.density === Math.min(zoomRun.ps, 3) && zoomRun.sharp && zoomRun.lowDensity === 1 && zoomRun.lowW,
    `canvas pixel density rises with the zoom (x${zoomRun.density} at full zoom-out, x1 near the ground)`);

  // Q / E side thrusters push the ship sideways without turning it
  const strafe = await page.evaluate(() => {
    const d = window.__moonLanderDebug, ML = window.MoonLander, r = {};
    const quiet = on => { for (const k of ['asteroids', 'aliens', 'sputniks', 'natives']) ML.setProperty(k, !on); };
    quiet(true); d.clear();                       // nothing around to knock or grab the ship
    for (const [key, name] of [['strafeR', 'e'], ['strafeL', 'q']]) {
      const s = d.state();
      d.place(s.W * 0.5, s.H * 0.3, 0, 0, 0, 0, true);
      ML.key(key, true);
      for (let i = 0; i < 30; i++) window.__moonLanderStep(1 / 60);
      ML.key(key, false);
      r[name] = d.state().vx; r[name + 'Angle'] = d.state().angle;
    }
    quiet(false);
    return r;
  });
  check(strafe.e > 5 && strafe.q < -5 && strafe.eAngle === 0 && strafe.qAngle === 0, `Q / E strafe left and right (vx ${strafe.q.toFixed(1)} / ${strafe.e.toFixed(1)})`);

  // boss fights: kills fill the meter, the boss arrives, attacks, and can be beaten on every world
  const bossRun = await page.evaluate(() => {
    const d = window.__moonLanderDebug, r = { fought: 0, names: [] };
    const fly = () => { const s = d.state(); d.place(s.W * 0.5, s.H * 0.45, 0, 0, 0, 0, true); };
    const step = n => { for (let i = 0; i < n; i++) window.__moonLanderStep(1 / 60); };
    d.cheat('god', true);
    fly(); d.bossKills(8);
    r.warned = d.bossState().delay > 0;
    step(200);
    r.arrived = d.bossState().active;
    d.killBoss();
    for (const id of ['mercury', 'venus', 'earth', 'mars', 'io', 'titan', 'miranda', 'triton', 'pluto']) {
      d.world(id); step(2); fly(); d.boss();
      const b = d.bossState();
      if (!b.active) continue;
      r.names.push(b.name);
      step(700);                      // long enough to run through every attack
      if (d.bossState().active) r.fought++;
      d.killBoss();
    }
    d.world('moon'); step(2); fly();
    r.beaten = d.bossState().beaten.length;
    d.cheat('god', false);
    return r;
  });
  check(bossRun.warned && bossRun.arrived, 'eight kills bring the boss');
  check(bossRun.fought === 9 && bossRun.beaten === 10, 'every world has a boss that fights and can be beaten ' + JSON.stringify(bossRun.names));

  // every weapon fires; holding fire overheats the gun, and it recovers
  const fired = await page.evaluate(() => {
    const d = window.__moonLanderDebug, r = {};
    d.cheat('god', true);
    for (const id of ['laser', 'scatter', 'rail', 'missile']) {
      d.weapon(id);
      for (let i = 0; i < 60; i++) window.__moonLanderStep(1 / 60);   // let the gun cool and the cooldown run out
      const s = d.state();
      d.place(s.W * 0.5, s.H * 0.4, 0, 0, 0, 0, true);                // upright and clear of the ground
      d.fire();
      window.__moonLanderStep(1 / 60);
      r[id] = d.econ().bullets;
      for (let i = 0; i < 150; i++) window.__moonLanderStep(1 / 60);
    }
    d.ship('classic'); d.weapon('laser');
    let over = -1;
    for (let i = 0; i < 900 && over < 0; i++) { d.fire(); window.__moonLanderStep(1 / 60); if (d.econ().overheated) over = i; }
    const before = d.econ().bullets;
    d.fire(); window.__moonLanderStep(1 / 60);
    r.locked = d.econ().bullets <= before;
    for (let i = 0; i < 240; i++) window.__moonLanderStep(1 / 60);
    r.over = over; r.recovered = !d.econ().overheated;
    d.cheat('god', false);
    return r;
  });
  check(fired.laser >= 1 && fired.scatter >= 5 && fired.rail >= 1 && fired.missile >= 1, 'all four weapons fire ' + JSON.stringify(fired));
  check(fired.over > 60 && fired.locked, `continuous fire overheats the weapon and locks it (after ${fired.over} frames)`);
  check(fired.recovered, 'weapon cools down and unlocks');
  await page.evaluate(() => { const d = window.__moonLanderDebug; d.sputniks(3); d.ufo(true); d.nuke(); d.cow(); });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: join(out, 'web-action.png') });

  // the hangar's reset row needs a second press, then wipes everything
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  check((await econ()).menuTab === 0, 'back on the upgrades tab');
  await page.keyboard.press('Digit9');
  check((await econ()).credits > 0, 'first press on RESET PROGRESS only asks');
  await page.screenshot({ path: join(out, 'web-reset.png') });
  await page.keyboard.press('Digit9');
  e = await econ();
  check(e.credits === 0 && e.weapons.length === 1 && e.ships.length === 1 && e.worlds.length === 1 && !e.cheatsUnlocked, 'second press resets all progress');
  await page.keyboard.press('Escape');
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
