/*
 * Moon Lander engine — shared by the Lively wallpaper (wallpaper/) and the
 * browser game (web/). See CLAUDE.md and docs/ARCHITECTURE.md before editing.
 *
 * Idle: the rocket flies a fixed route and lands back on its pad (a seamless
 * loop) while Earth turns once per cycle. "Random hops" mode lands anywhere.
 *
 * Controls
 *   Arrow keys / WASD  Up = main engine. Left/Right = side thrusters (spin keeps
 *                      going until you counter-steer). Down = damp the spin.
 *   Space fire · H autopilot on/off · Tab/G upgrades menu
 *   Drag the rocket    pick it up and throw it
 *   Click              asteroids, UFOs, Sputniks, shooting stars, the sky
 *
 * Host config (set before this script loads):
 *   window.MOON_LANDER = { mode: 'wallpaper' | 'game', defaults: { ...cfg overrides } }
 * Settings arrive through window.livelyPropertyListener(name, value) — Lively
 * calls it in the wallpaper; web/shell.js calls it in the game.
 * Lively also calls livelyWallpaperPlaybackChanged (needs "--pause-event true").
 * The game shell drives the engine through window.MoonLander (bottom of file).
 */
'use strict';

(function () {
  const HOST = window.MOON_LANDER || {};
  const MODE = HOST.mode === 'game' ? 'game' : 'wallpaper';
  const VERSION = '__VERSION__';            // replaced by scripts/build.mjs
  // ================================================================ config
  const cfg = {
    flightMode: 0,          // 0 = clean loop, 1 = random hops
    pixelSize: 3,
    rocketScale: 1,
    flightSpeed: 100,
    restTime: 6,
    starDensity: 50,
    skyTop: '#03040c',
    skyBottom: '#1d1a3c',
    groundColor: '#a9a7b6',
    showEarth: true,
    earthSpin: true,
    shootingStars: true,
    clickToFly: true,
    mouseParallax: true,
    keyboardControl: true,
    dragRocket: true,
    asteroids: true,
    crashes: true,
    autopilot: true,
    idleReturn: 20,
    steering: 100,
    showHud: true,
    worldSize: 3,           // screens wide
    aliens: true,
    sputniks: true,
    natives: true,
    bosses: true,
    eggs: true,
    cheats: true,
    bodyColor: '#bdc6cb',
    trimColor: '#bdc6cb',
    decalColor: '#3e67fc',
    flameStyle: 0,          // 0 = solid colour, 1 = rainbow
    flameColor: '#ff9a2a',
    laserColor: '#7ff0ff',
    fpsLimit: 60
  };
  Object.assign(cfg, HOST.defaults || {});   // per-target defaults (e.g. the game starts with autopilot off)

  // Worlds you can fly on. grav multiplies the Moon's gravity, stars the star density; body is what
  // hangs in the sky (see BODIES) at bodyScale x Earth's size. The Moon uses the colour settings.
  const WORLDS = [
    { id: 'moon', name: 'MOON', desc: 'HOME BASE. EARTH IN THE SKY', cost: 0, grav: 1, stars: 1, body: 'earth', bodyScale: 1 },
    { id: 'mercury', name: 'MERCURY', desc: 'SCORCHED ROCK UNDER A HUGE SUN. HEAVY', cost: 150, grav: 1.35, stars: 1, body: 'sun', bodyScale: 1.7,
      ground: '#8f8880', skyTop: '#050409', skyBottom: '#2a1a12' },
    { id: 'venus', name: 'VENUS', desc: 'CRUSHING GRAVITY UNDER A YELLOW HAZE', cost: 250, grav: 1.6, stars: 0, body: 'sun', bodyScale: 0.9,
      ground: '#c9903a', skyTop: '#6b3a10', skyBottom: '#e0a040' },
    { id: 'earth', name: 'EARTH', desc: 'HOME. THE HEAVIEST GRAVITY OF ALL', cost: 400, grav: 1.9, stars: 0.15, body: 'luna', bodyScale: 0.6,
      ground: '#5f9a4a', skyTop: '#1c4fa8', skyBottom: '#9fd0ff' },
    { id: 'mars', name: 'MARS', desc: 'RED DUST AND A SMALL PALE SUN', cost: 200, grav: 1.35, stars: 0.5, body: 'sun', bodyScale: 0.45,
      ground: '#b5583a', skyTop: '#2a1410', skyBottom: '#c98a62' },
    { id: 'io', name: 'IO', desc: 'SULPHUR PLAINS BELOW GIANT JUPITER', cost: 300, grav: 1.1, stars: 1, body: 'jupiter', bodyScale: 2.2,
      ground: '#c9b84a', skyTop: '#040408', skyBottom: '#241c10' },
    { id: 'titan', name: 'TITAN', desc: 'ORANGE SMOG, LIGHT GRAVITY, SATURN OVERHEAD', cost: 350, grav: 0.85, stars: 0.1, body: 'saturn', bodyScale: 1.3,
      ground: '#a8782e', skyTop: '#3a2408', skyBottom: '#c88a30' },
    { id: 'miranda', name: 'MIRANDA', desc: 'ALMOST NO GRAVITY. URANUS FILLS THE SKY', cost: 350, grav: 0.35, stars: 1, body: 'uranus', bodyScale: 1.8,
      ground: '#9fb4b8', skyTop: '#02040a', skyBottom: '#10242c' },
    { id: 'triton', name: 'TRITON', desc: 'PINK ICE UNDER BLUE NEPTUNE', cost: 400, grav: 0.6, stars: 1, body: 'neptune', bodyScale: 1.4,
      ground: '#c8b8c8', skyTop: '#020308', skyBottom: '#141a3c' },
    { id: 'pluto', name: 'PLUTO', desc: 'THE EDGE. CHARON HANGS IN THE DARK', cost: 500, grav: 0.5, stars: 1, body: 'charon', bodyScale: 1.2,
      ground: '#c9a98a', skyTop: '#010103', skyBottom: '#0c0c18' }
  ];
  let worldDef = WORLDS[0];
  const groundCol = () => worldDef.ground || cfg.groundColor;
  const skyTopCol = () => worldDef.skyTop || cfg.skyTop;
  const skyBotCol = () => worldDef.skyBottom || cfg.skyBottom;

  let needsRebuild = true;
  let needsShip = true;
  let worldSeed = (Math.random() * 1e9) | 0;
  let time = 0;

  window.livelyPropertyListener = function (name, val) {
    switch (name) {
      case 'flightMode': cfg.flightMode = Number(val); needsRebuild = true; break;
      case 'pixelSize': cfg.pixelSize = Number(val); needsRebuild = true; break;
      case 'rocketScale': cfg.rocketScale = Number(val) + 1; needsRebuild = true; break;
      case 'flightSpeed': cfg.flightSpeed = Number(val); break;
      case 'restTime': cfg.restTime = Number(val); break;
      case 'starDensity': cfg.starDensity = Number(val); needsRebuild = true; break;
      case 'skyTop': cfg.skyTop = val; needsRebuild = true; break;
      case 'skyBottom': cfg.skyBottom = val; needsRebuild = true; break;
      case 'groundColor': cfg.groundColor = val; needsRebuild = true; break;
      case 'showEarth': cfg.showEarth = !!val; break;
      case 'earthSpin': cfg.earthSpin = !!val; break;
      case 'shootingStars': cfg.shootingStars = !!val; break;
      case 'clickToFly': cfg.clickToFly = !!val; break;
      case 'mouseParallax': cfg.mouseParallax = !!val; break;
      case 'keyboardControl': cfg.keyboardControl = !!val; break;
      case 'dragRocket': cfg.dragRocket = !!val; break;
      case 'asteroids': cfg.asteroids = !!val; if (!val) asteroids.length = 0; break;
      case 'crashes': cfg.crashes = !!val; break;
      case 'idleReturn': cfg.idleReturn = Number(val); break;
      case 'autopilot': cfg.autopilot = !!val; break;
      case 'steering': cfg.steering = Number(val); break;
      case 'resetProgress': resetProgress(); break;
      case 'showHud': cfg.showHud = !!val; break;
      case 'worldSize': cfg.worldSize = [1, 3, 5][Number(val)] || 3; needsRebuild = true; break;
      case 'aliens': cfg.aliens = !!val; break;
      case 'eggs': cfg.eggs = !!val; break;
      case 'natives': cfg.natives = !!val; if (!val) foes.length = 0; break;
      case 'bosses': cfg.bosses = !!val; if (!val && boss) boss.state = 'leave'; break;
      case 'cheats': cfg.cheats = !!val; break;
      case 'sputniks': cfg.sputniks = !!val; if (!val) sputniks.length = 0; break;
      case 'bodyColor': cfg.bodyColor = val; needsShip = true; break;
      case 'trimColor': cfg.trimColor = val; needsShip = true; break;
      case 'decalColor': cfg.decalColor = val; needsShip = true; break;
      case 'flameStyle': cfg.flameStyle = Number(val); break;
      case 'flameColor': cfg.flameColor = val; buildFlame(); break;
      case 'laserColor': cfg.laserColor = val; break;
      case 'fpsLimit': cfg.fpsLimit = [30, 60, 0][Number(val)] ?? 60; break;
      case 'newMoon': worldSeed = (Math.random() * 1e9) | 0; needsRebuild = true; break;
    }
  };

  let paused = false;
  window.livelyWallpaperPlaybackChanged = function (data) {
    try { setPaused(!!JSON.parse(data).IsPaused); } catch (e) { /* ignore */ }
  };

  // ================================================================ helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mod = (v, m) => ((v % m) + m) % m;
  const TAU = Math.PI * 2;

  function hexToRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 8) h = h.slice(2);
    const n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const mixRgb = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgbStr = c => 'rgb(' + (clamp(c[0], 0, 255) | 0) + ',' + (clamp(c[1], 0, 255) | 0) + ',' + (clamp(c[2], 0, 255) | 0) + ')';
  function hslRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, hp = mod(h, 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
    const m = l - c / 2;
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function rgbHue(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let noiseSeed = 1337;
  function hash3(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177 + noiseSeed) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
    const c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
    const c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
    const c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    const x00 = lerp(c000, c100, u), x10 = lerp(c010, c110, u);
    const x01 = lerp(c001, c101, u), x11 = lerp(c011, c111, u);
    return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
  }
  function fbm3(x, y, z) {
    let s = 0, a = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { s += a * vnoise3(x * f, y * f, z * f); f *= 2; a *= 0.5; }
    return s / 0.9375;
  }
  // Noise that repeats every `period` px in x, so the wrapped world has no seam.
  function loopNoise(x, period, freq, z) {
    const th = (x / period) * TAU, r = (freq * period) / TAU;
    return vnoise3(Math.cos(th) * r, Math.sin(th) * r, z);
  }
  function loopFbm(x, period, freq, z) {
    const th = (x / period) * TAU, r = (freq * period) / TAU;
    return fbm3(Math.cos(th) * r, Math.sin(th) * r, z);
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // ================================================================ canvas & world
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, PS = 1, DPR = 1, RS = 1, S = 1;
  let WW = 0;        // world width (wraps)
  let CEIL = 0;      // how far above the screen the sky extends
  let RW = 0;        // far ridge period
  const cam = { x: 0, y: 0 };
  let rcx = 0, rcy = 0;   // camera rounded to whole pixels for this frame

  const wrapX = x => mod(x, WW);
  const wd = d => d - WW * Math.round(d / WW);          // shortest wrapped distance
  const sxOf = x => W / 2 + wd(x - rcx - W / 2);
  const syOf = y => y - rcy;

  let ground = null, ridgeH = null;
  let skyCanvas, ridgeCanvas, fgCanvas;
  let stars = [];

  function groundY(x) { return ground[mod(Math.round(x), WW)]; }

  function build() {
    needsRebuild = false;
    DPR = window.devicePixelRatio || 1;
    const physW = Math.max(1, Math.round(window.innerWidth * DPR));
    const physH = Math.max(1, Math.round(window.innerHeight * DPR));
    PS = Math.max(1, Math.round(cfg.pixelSize * physH / 1080));
    RS = Math.max(1, cfg.rocketScale | 0);
    W = Math.ceil(physW / PS);
    H = Math.ceil(physH / PS);
    S = H / 360;
    WW = W * Math.max(1, cfg.worldSize | 0);
    CEIL = cfg.worldSize > 1 ? Math.round(H * 1.5) : 0;
    RW = W * 2;

    canvas.width = W;
    canvas.height = H;
    canvas.style.width = (W * PS / DPR) + 'px';
    canvas.style.height = (H * PS / DPR) + 'px';
    ctx.imageSmoothingEnabled = false;

    const seed = (worldSeed + 7919 * WORLDS.indexOf(worldDef)) | 0;    // every world gets its own terrain
    noiseSeed = seed;
    const rng = mulberry32(seed);
    buildTerrain(rng);
    buildRidge(rng);
    buildSky();
    buildStars(rng);
    buildEarth();
    buildFlame();

    particles.length = 0; shooting.length = 0; asteroids.length = 0; bullets.length = 0;
    plasma.length = 0; cows.length = 0; escapees.length = 0; sputniks.length = 0; foes.length = 0;
    ufo = null; missile = null; boss = null; bossMeter = 0; bossDelay = 0;
    resetRocket();
    buildLoop(rng);
    cam.x = 0; cam.y = 0;
  }

  // ---------------------------------------------------------------- terrain
  function buildTerrain(rng) {
    ground = new Float32Array(WW);
    const crater = new Float32Array(WW);
    const p = [rng() * TAU, rng() * TAU];
    const base = H * 0.82;
    const n1 = Math.max(1, Math.round(WW / (H * 2.86)));
    const n2 = Math.max(1, Math.round(WW / (H * 1.0)));
    for (let x = 0; x < WW; x++) {
      const th = (x / WW) * TAU;
      ground[x] = base
        + Math.sin(th * n1 + p[0]) * H * 0.022
        + Math.sin(th * n2 + p[1]) * H * 0.010
        + (loopNoise(x, WW, 0.08, 9.1) - 0.5) * 2.2 * S;
    }

    // craters seen edge-on: bowl with raised rim
    const craterCount = Math.round(WW / 55);
    for (let i = 0; i < craterCount; i++) {
      const cx = rng() * WW;
      const r = (rng() < 0.2 ? rng() * 26 + 18 : rng() * 12 + 5) * S;
      const depth = r * (0.22 + rng() * 0.12);
      for (let xi = Math.floor(cx - r * 1.6); xi <= Math.ceil(cx + r * 1.6); xi++) {
        const x = mod(xi, WW);
        const d = Math.abs((xi - cx) / r);
        if (d < 1) {
          ground[x] += depth * (1 - d * d);
          crater[x] = Math.max(crater[x], 1 - d);
        }
        ground[x] -= depth * 0.32 * Math.exp(-Math.pow((d - 1) / 0.22, 2));
      }
    }

    fgCanvas = makeCanvas(WW, H);
    const fctx = fgCanvas.getContext('2d');
    const img = fctx.createImageData(WW, H);
    const d = img.data;
    const g = hexToRgb(groundCol());
    const nr = (0.17 * WW) / TAU;
    const colC = new Float32Array(WW), colS = new Float32Array(WW);
    for (let x = 0; x < WW; x++) { const th = (x / WW) * TAU; colC[x] = Math.cos(th) * nr; colS[x] = Math.sin(th) * nr; }

    for (let x = 0; x < WW; x++) {
      const top = Math.ceil(ground[x]);
      const slope = ground[mod(x - 1, WW)] - ground[mod(x + 1, WW)];
      for (let y = Math.max(0, top); y < H; y++) {
        const depthPx = y - top;
        let s = 1;
        if (depthPx === 0) s += 0.16;
        else if (depthPx === 1) s += 0.06;
        s += clamp(slope * 0.22, -0.32, 0.3) * Math.exp(-depthPx / 7);
        s -= crater[x] * 0.12 * Math.exp(-depthPx / 10);
        s *= 0.86 + 0.26 * vnoise3(colC[x], colS[x], y * 0.17 + 3.7);
        const sp = hash3(x, y, 77);
        if (sp < 0.010) s *= 1.22; else if (sp < 0.022) s *= 0.74;
        s *= 1 - Math.min(0.5, depthPx / (H * 0.2) * 0.5);
        s = Math.floor(s * 14 + bayer(x, y)) / 14;
        const i = (y * WW + x) * 4;
        d[i] = clamp(g[0] * s, 0, 255);
        d[i + 1] = clamp(g[1] * s, 0, 255);
        d[i + 2] = clamp(g[2] * s, 0, 255);
        d[i + 3] = 255;
      }
    }

    // craters seen face-on across the plain
    const faceCount = Math.round(WW * H / 2600);
    for (let k = 0; k < faceCount; k++) {
      const cx = rng() * WW;
      const surf = ground[mod(Math.floor(cx), WW)];
      const span = H - surf;
      if (span < 8) continue;
      const cyFrac = Math.pow(rng(), 0.8);
      const cy = surf + 4 + cyFrac * (span - 4);
      const persp = 0.35 + 0.65 * cyFrac;
      const rx = (rng() < 0.12 ? rng() * 22 + 10 : rng() * 7 + 2.5) * persp * S;
      const ry = rx * (0.28 + 0.18 * cyFrac);
      if (rx < 1.5) continue;
      for (let py = Math.floor(cy - ry * 1.6); py <= Math.ceil(cy + ry * 1.6); py++) {
        if (py < 0 || py >= H) continue;
        for (let px = Math.floor(cx - rx * 1.6); px <= Math.ceil(cx + rx * 1.6); px++) {
          const X = mod(px, WW);
          if (py < Math.ceil(ground[X]) + 2) continue;
          const nx = (px + 0.5 - cx) / rx, ny = (py + 0.5 - cy) / ry;
          const e = nx * nx + ny * ny;
          let f;
          if (e < 1) f = 0.66 + 0.2 * nx + 0.1 * ny;
          else if (e < 1.7) f = 1 + 0.16 * clamp(nx * 0.5 + ny * 0.9, -1, 1) * (1.7 - e) / 0.7;
          else continue;
          f = Math.floor(f * 12 + bayer(X, py)) / 12;
          const i = (py * WW + X) * 4;
          d[i] = clamp(d[i] * f, 0, 255);
          d[i + 1] = clamp(d[i + 1] * f, 0, 255);
          d[i + 2] = clamp(d[i + 2] * f, 0, 255);
        }
      }
    }
    fctx.putImageData(img, 0, 0);

    // boulders
    const rocks = Math.round(WW / 45);
    for (let i = 0; i < rocks; i++) {
      const x = Math.floor(rng() * WW);
      const w = rng() < 0.3 ? 3 : 2;
      const y = Math.round(ground[x]) - (w === 3 ? 2 : 1);
      fctx.fillStyle = rgbStr(g.map(v => v * 0.62));
      fctx.fillRect(Math.min(x, WW - w), y, w, w === 3 ? 2 : 1);
      fctx.fillStyle = rgbStr(g.map(v => v * 1.08));
      fctx.fillRect(Math.min(x, WW - w), y, 1, 1);
    }
  }

  // ---------------------------------------------------------------- far ridge (parallax layer)
  function buildRidge(rng) {
    ridgeH = new Float32Array(RW);
    const p = [rng() * TAU, rng() * TAU, rng() * 100];
    const m1 = Math.max(1, Math.round(RW / (H * 4.16)));
    const m2 = Math.max(1, Math.round(RW / (H * 1.52)));
    for (let x = 0; x < RW; x++) {
      const th = (x / RW) * TAU;
      ridgeH[x] = H * 0.71
        + Math.sin(th * m1 + p[0]) * H * 0.035
        + Math.sin(th * m2 + p[1]) * H * 0.018
        + (loopFbm(x, RW, 0.035, p[2]) - 0.5) * H * 0.03;
    }
    ridgeCanvas = makeCanvas(RW, H);
    const rc = ridgeCanvas.getContext('2d');
    const img = rc.createImageData(RW, H);
    const d = img.data;
    const bot = hexToRgb(skyBotCol()), g = hexToRgb(groundCol());
    const ridge = [lerp(g[0] * 0.42, bot[0], 0.35), lerp(g[1] * 0.42, bot[1], 0.35), lerp(g[2] * 0.42, bot[2], 0.35)];
    const nr = (0.12 * RW) / TAU;
    for (let x = 0; x < RW; x++) {
      const th = (x / RW) * TAU, c0 = Math.cos(th) * nr, s0 = Math.sin(th) * nr;
      const top = Math.ceil(ridgeH[x]);
      for (let y = Math.max(0, top); y < H; y++) {
        const dep = y - top;
        let s = dep === 0 ? 1.25 : 1 - Math.min(0.35, dep / (H * 0.15) * 0.35);
        s *= 0.9 + 0.2 * vnoise3(c0, s0, y * 0.12 + 55);
        s = Math.floor(s * 10 + bayer(x, y)) / 10;
        const i = (y * RW + x) * 4;
        d[i] = ridge[0] * s; d[i + 1] = ridge[1] * s; d[i + 2] = ridge[2] * s; d[i + 3] = 255;
      }
    }
    rc.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------- sky (screen-fixed)
  function buildSky() {
    skyCanvas = makeCanvas(W, H);
    const bctx = skyCanvas.getContext('2d');
    const img = bctx.createImageData(W, H);
    const d = img.data;
    const top = hexToRgb(skyTopCol()), bot = hexToRgb(skyBotCol());
    const neb = [clamp(bot[0] * 1.9 + 30, 0, 255), clamp(bot[1] * 1.3 + 10, 0, 255), clamp(bot[2] * 1.8 + 40, 0, 255)];
    for (let y = 0; y < H; y++) {
      const t = Math.pow(clamp(y / (H * 0.8), 0, 1), 1.35);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, b = bayer(x, y);
        const tq = Math.floor(t * 16 + b) / 16;
        let r = lerp(top[0], bot[0], tq), gg = lerp(top[1], bot[1], tq), bb = lerp(top[2], bot[2], tq);
        const band = Math.exp(-Math.pow(y / H - 0.34 - 0.12 * Math.sin(x / W * 4.1 + 1.3), 2) / 0.018);
        if (band > 0.02) {
          const n = fbm3(x / 70, y / 38, 7.3);
          let a = Math.max(0, n - 0.46) * 2.1 * band * 0.42;
          a = Math.floor(a * 8 + b) / 8;
          r = lerp(r, neb[0], a); gg = lerp(gg, neb[1], a); bb = lerp(bb, neb[2], a);
        }
        d[i] = r; d[i + 1] = gg; d[i + 2] = bb; d[i + 3] = 255;
      }
    }
    bctx.putImageData(img, 0, 0);
  }

  function buildStars(rng) {
    stars = [];
    const target = Math.round(W * H * 1.3 * 0.005 * (cfg.starDensity / 100) * worldDef.stars);
    const tints = ['#ffffff', '#ffffff', '#cfe0ff', '#fff0d2', '#ffd8e4'];
    for (let i = 0; i < target; i++) {
      const layer = rng() < 0.6 ? 0 : rng() < 0.75 ? 1 : 2;
      const bright = (0.25 + rng() * 0.75) * (layer === 2 ? 1 : layer === 1 ? 0.8 : 0.6);
      stars.push({
        x: rng() * W, y: lerp(-0.5 * H, 0.8 * H, rng()), layer, bright,
        par: [0.03, 0.07, 0.12][layer],
        big: layer === 2 && bright > 0.82,
        col: tints[(rng() * tints.length) | 0],
        tw: 0.4 + rng() * 2.6, ph: rng() * TAU
      });
    }
  }

  // ================================================================ Earth (texture-mapped, rotating)
  // `earth` is whatever hangs in the sky of the current world: Earth from the Moon, Jupiter from Io...
  // A body's tex(x, y, z) returns the surface colour at a point on the unit sphere (y = latitude).
  // atm = limb tint, halo = glow outside the disc, unlit = no day/night shading, rings = ring colour.
  const bands = (y, n, f) => 0.5 + 0.5 * Math.sin(y * f + (n - 0.5) * 3);
  const BODIES = {
    earth: { name: 'EARTH', atm: [110, 180, 255], halo: [90, 160, 255] },
    sun: { name: 'THE SUN', unlit: true, halo: [255, 196, 90],
      tex: (x, y, z) => mixRgb([255, 150, 30], [255, 244, 180], clamp(fbm3(x * 3 + 5, y * 3, z * 3) * 1.6 - 0.3, 0, 1)) },
    luna: { name: 'THE MOON',
      tex: (x, y, z) => { const n = fbm3(x * 2.2 + 20, y * 2.2, z * 2.2); return n > 0.56 ? [142, 142, 152] : n > 0.47 ? [190, 190, 198] : [224, 224, 230]; } },
    jupiter: { name: 'JUPITER', atm: [255, 226, 180], halo: [190, 150, 100],
      tex: (x, y, z) => {
        if (Math.hypot(x - 0.55, y - 0.38, z - 0.74) < 0.2) return [196, 84, 52];          // the Great Red Spot
        return mixRgb([168, 108, 70], [234, 212, 176], bands(y, fbm3(x * 2 + 30, y * 6, z * 2), 13));
      } },
    saturn: { name: 'SATURN', atm: [255, 236, 190], halo: [190, 160, 110], rings: [216, 192, 142],
      tex: (x, y, z) => mixRgb([188, 156, 104], [234, 212, 160], bands(y, fbm3(x * 2 + 40, y * 5, z * 2), 10)) },
    uranus: { name: 'URANUS', atm: [210, 250, 250], halo: [120, 200, 210],
      tex: (x, y, z) => mixRgb([132, 204, 212], [178, 234, 234], bands(y, fbm3(x + 60, y * 3, z), 5)) },
    neptune: { name: 'NEPTUNE', atm: [150, 190, 255], halo: [70, 110, 230],
      tex: (x, y, z) => {
        const col = mixRgb([34, 66, 186], [72, 122, 236], bands(y, fbm3(x * 2 + 70, y * 5, z * 2), 7));
        return fbm3(x * 3 + 80, y * 10, z * 3) > 0.66 ? mixRgb(col, [235, 242, 255], 0.6) : col;
      } },
    charon: { name: 'CHARON',
      tex: (x, y, z) => { const n = fbm3(x * 2.4 + 90, y * 2.4, z * 2.4); return y < -0.72 ? [128, 84, 72] : n > 0.55 ? [118, 112, 110] : [164, 156, 150]; } }
  };
  let earth = null;

  function buildEarth() {
    const body = BODIES[worldDef.body];
    const R = Math.max(4, Math.round(H * 0.065 * worldDef.bodyScale));
    const size = 2 * R + 4, c = R + 2;
    const TW = Math.max(48, Math.round(TAU * R * 1.5));
    const TH = Math.max(24, Math.round(Math.PI * R * 1.5));
    const tex = new Uint8ClampedArray(TW * TH * 3);
    const city = new Uint8Array(TW * TH);
    for (let v = 0; v < TH; v++) {
      const lat = ((v + 0.5) / TH) * Math.PI - Math.PI / 2;
      const cl = Math.cos(lat), sl = Math.sin(lat);
      for (let u = 0; u < TW; u++) {
        const lon = ((u + 0.5) / TW) * TAU;
        const px = cl * Math.sin(lon), py = sl, pz = cl * Math.cos(lon);
        if (body.tex) {
          const col = body.tex(px, py, pz), t = v * TW + u;
          tex[t * 3] = col[0]; tex[t * 3 + 1] = col[1]; tex[t * 3 + 2] = col[2];
          continue;
        }
        const land = fbm3(px * 1.7 + 10, py * 1.7, pz * 1.7);
        const cloud = fbm3(px * 2.4 + 50, py * 4.2, pz * 2.4);
        let col;
        const ice = Math.abs(py) > 0.86;
        if (ice) col = [226, 236, 246];
        else if (land > 0.62) col = [176, 152, 92];
        else if (land > 0.53) col = [62, 136, 66];
        else if (land > 0.42) col = [34, 92, 176];
        else col = [24, 64, 146];
        if (cloud > 0.57) {
          const k = clamp((cloud - 0.57) * 6, 0, 0.9);
          col = mixRgb(col, [245, 248, 255], k);
        }
        const t = v * TW + u;
        tex[t * 3] = col[0]; tex[t * 3 + 1] = col[1]; tex[t * 3 + 2] = col[2];
        city[t] = (!ice && land > 0.53 && cloud < 0.6 && hash3(u, v, 91) < 0.16) ? 1 : 0;
      }
    }

    const L = [-0.62, -0.32, 0.72];
    const ll = Math.hypot(L[0], L[1], L[2]);
    const tilt = 0.41, ct = Math.cos(tilt), st = Math.sin(tilt);
    const idx = [], lon = [], vrow = [], bq = [], limb = [], bay = [];
    const halo = [];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px + 0.5 - c, dy = py + 0.5 - c;
        const r = Math.hypot(dx, dy);
        if (r > R + 1) continue;
        const nx = dx / R, ny = dy / R;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const light = (nx * L[0] + ny * L[1] + nz * L[2]) / ll;
        if (r > R) {
          const a = clamp(light + 0.3, 0, 1) * 0.55;
          if (body.halo && (a > 0.05 || body.unlit)) halo.push(py * size + px, body.unlit ? 0.6 : a, bayer(px, py));
          continue;
        }
        const bx = nx * ct - ny * st, by = nx * st + ny * ct;
        idx.push(py * size + px);
        lon.push(Math.atan2(bx, nz));
        vrow.push(clamp(Math.floor((Math.asin(clamp(by, -1, 1)) / Math.PI + 0.5) * TH), 0, TH - 1));
        bq.push(body.unlit ? 1 : Math.floor(clamp(light * 1.25 + 0.08, 0, 1) * 5 + bayer(px, py)) / 5);
        limb.push(body.atm && r > R - 1.3 ? 1 : 0);
        bay.push(bayer(px, py));
      }
    }
    const cv = makeCanvas(size, size);
    // Rings: a tilted ellipse split into the half behind the planet and the half in front of it.
    let ring = null;
    if (body.rings) {
      const rc = Math.ceil(R * 2.3) + 1, rs = rc * 2;
      const back = makeCanvas(rs, rs), front = makeCanvas(rs, rs);
      const bg = back.getContext('2d'), fg = front.getContext('2d');
      const ca = Math.cos(-0.3), sa = Math.sin(-0.3);
      for (let py = 0; py < rs; py++) for (let px = 0; px < rs; px++) {
        const dx = px + 0.5 - rc, dy = py + 0.5 - rc;
        const ex = dx * ca - dy * sa, ey = (dx * sa + dy * ca) / 0.3;
        const rr = Math.hypot(ex, ey) / R;
        if (rr < 1.35 || rr > 2.2 || (rr > 1.78 && rr < 1.88)) continue;
        const k = (rr < 1.78 ? 1 : 0.7) * (0.8 + 0.2 * bayer(px, py));
        const g = ey < 0 ? bg : fg;
        g.fillStyle = rgbStr(body.rings.map(v => v * k));
        g.fillRect(px, py, 1, 1);
      }
      ring = { back, front, c: rc };
    }
    earth = {
      name: body.name, atm: body.atm || [0, 0, 0], haloCol: body.halo || [0, 0, 0], ring,
      R, size, c, TW, TH, tex, city,
      idx: Int32Array.from(idx), lon: Float32Array.from(lon), vrow: Int32Array.from(vrow),
      bq: Float32Array.from(bq), limb: Uint8Array.from(limb), bay: Float32Array.from(bay), halo,
      x: Math.round(W * 0.8), y: Math.round(H * 0.2),
      canvas: cv, cctx: cv.getContext('2d'), img: cv.getContext('2d').createImageData(size, size),
      state: 'ok', t: 0, shards: [], clicks: [], fromNuke: false
    };
  }

  function earthRot() {
    if (!cfg.earthSpin) return 0;
    if (cfg.flightMode === 0 && loop) return TAU * vClock() / loopTimes().period;   // one turn per loop
    return TAU * time / 24;
  }

  function renderEarth(rot, reveal, bsod) {
    const e = earth, d = e.img.data;
    d.fill(0);
    const turn = rot / TAU;
    const n = e.idx.length;
    for (let k = 0; k < n; k++) {
      if (reveal < 1 && e.bay[k] >= reveal) continue;
      const i = e.idx[k] * 4, b = e.bq[k];
      let r, g, bl;
      if (bsod) {
        const s = 0.6 + 0.4 * b;
        r = 0; g = 120 * s; bl = 215 * s;
      } else {
        const u = Math.floor(mod(e.lon[k] / TAU - turn, 1) * e.TW) % e.TW;
        const t = e.vrow[k] * e.TW + u;
        const cr = e.tex[t * 3], cg = e.tex[t * 3 + 1], cb = e.tex[t * 3 + 2];
        r = lerp(6, cr, b); g = lerp(10, cg, b); bl = lerp(28, cb, b);
        if (b <= 0.2 && e.city[t]) { r = 255; g = 205; bl = 120; }   // city lights on the night side
        if (e.limb[k]) {
          const kk = 0.45 * clamp(b + 0.15, 0, 1);
          r = lerp(r, e.atm[0], kk); g = lerp(g, e.atm[1], kk); bl = lerp(bl, e.atm[2], kk);
        }
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = bl; d[i + 3] = 255;
    }
    for (let k = 0; k < e.halo.length; k += 3) {
      if (reveal < 1 && e.halo[k + 2] >= reveal) continue;
      const i = e.halo[k] * 4;
      d[i] = e.haloCol[0]; d[i + 1] = e.haloCol[1]; d[i + 2] = e.haloCol[2]; d[i + 3] = e.halo[k + 1] * 255;
    }
    e.cctx.putImageData(e.img, 0, 0);
  }

  const earthScreenY = () => Math.round(earth.y - rcy * 0.06);
  const earthVisible = () => cfg.showEarth && earth && (earth.state === 'ok' || earth.state === 'bsod' || earth.state === 'reveal');

  function updateEarth(dt) {
    const e = earth;
    if (!e) return;
    e.t += dt;
    switch (e.state) {
      case 'bsod':
        if (e.t > 5) { e.state = 'reveal'; e.t = 0; e.fromNuke = false; toast(e.name + ' RESTARTED', 2); }
        break;
      case 'boom':
        for (const s of e.shards) {
          const drag = Math.max(0, 1 - dt * 0.35);
          s.vx *= drag; s.vy *= drag;
          s.ox += s.vx * dt; s.oy += s.vy * dt; s.a += s.spin * dt;
        }
        if (e.t > 10) { e.state = 'restore'; e.t = 0; }
        break;
      case 'restore':
        if (e.t > 3.6) { e.state = 'reveal'; e.t = 0; }
        break;
      case 'reveal':
        if (e.t > 1.6) {
          e.state = 'ok'; e.t = 0;
          if (e.fromNuke) toast(e.name + " RESTORED. PLEASE DON'T DO THAT AGAIN", 3.5);
          e.fromNuke = false;
        }
        break;
    }
  }

  function drawEarth() {
    const e = earth, ex = e.x, ey = earthScreenY();
    const left = ex - e.c, top = ey - e.c;
    const rot = earthRot();
    const rings = e.ring && e.state !== 'boom' && e.state !== 'restore';
    if (rings) ctx.drawImage(e.ring.back, ex - e.ring.c, ey - e.ring.c);
    switch (e.state) {
      case 'ok': renderEarth(rot, 1, false); ctx.drawImage(e.canvas, left, top); break;
      case 'bsod':
        renderEarth(rot, 1, true); ctx.drawImage(e.canvas, left, top);
        { const sc = e.R >= 14 ? 2 : 1; drawText(':(', ex - Math.round(textWidth(':(', sc) / 2), ey - Math.round(2.5 * sc), '#ffffff', sc); }
        break;
      case 'reveal': renderEarth(rot, clamp(e.t / 1.5, 0, 1), false); ctx.drawImage(e.canvas, left, top); break;
      case 'boom': drawBoom(ex, ey); break;
    }
    if (rings) ctx.drawImage(e.ring.front, ex - e.ring.c, ey - e.ring.c);
  }

  function drawBoom(ex, ey) {
    const e = earth, t = e.t, R = e.R;
    const fade = clamp(1 - (t - 2.5) / 6, 0, 1);
    if (fade > 0) {
      ctx.globalAlpha = fade;
      for (const s of e.shards) {
        ctx.save();
        ctx.translate(Math.round(ex + s.ox), Math.round(ey + s.oy));
        ctx.rotate(s.a);
        ctx.drawImage(e.canvas, s.sx, s.sy, s.bs, s.bs, -(s.bs >> 1), -(s.bs >> 1), s.bs, s.bs);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    const disc = (r, col, a) => {
      ctx.globalAlpha = clamp(a, 0, 1); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(ex, ey, Math.max(0.5, r), 0, TAU); ctx.fill();
    };
    if (t < 1.8) {
      const k = t / 1.8, r = R * (0.9 + 2.4 * Math.sqrt(k));
      disc(r, '#ff5a1e', (1 - k) * 0.9);
      disc(r * 0.72, '#ffb347', (1 - k) * 0.95);
      disc(r * 0.42 * (1 - k * 0.6), '#fff3c4', 1 - k);
    }
    if (t < 0.15) disc(R * 1.5, '#ffffff', 1);
    if (t < 3.2) {
      const rx = R * (1.2 + 8 * t);
      ctx.globalAlpha = (1 - t / 3.2) * 0.8;
      ctx.strokeStyle = '#ffe9c4';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(ex, ey, rx, rx * 0.28, -0.2, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================ ship sprite & colours
  const SPR = 64, FLAME_ROOM = 34, NOZZLE_Y = 57, NOZZLE_X = 32, HALF = 32;
  const baseSprite = new Image();
  let basePixels = null;
  const shipCanvas = makeCanvas(SPR, SPR);
  baseSprite.onload = () => {
    const c = makeCanvas(SPR, SPR), g = c.getContext('2d');
    g.drawImage(baseSprite, 0, 0);
    try { basePixels = g.getImageData(0, 0, SPR, SPR); } catch (e) { basePixels = null; }
    needsShip = true;
  };
  baseSprite.src = window.ROCKET_PNG || 'rocket.png';

  // Recolour by multiplying each region by (chosen colour / original colour),
  // which keeps all the sprite's shading.
  function buildShip() {
    needsShip = false;
    const g = shipCanvas.getContext('2d');
    g.clearRect(0, 0, SPR, SPR);
    if (!basePixels) {
      if (baseSprite.complete && baseSprite.naturalWidth) g.drawImage(baseSprite, 0, 0);
      return;
    }
    const out = g.createImageData(SPR, SPR);
    const src = basePixels.data, d = out.data;
    const body = hexToRgb(cfg.bodyColor), trim = hexToRgb(cfg.trimColor), decal = hexToRgb(cfg.decalColor);
    const B0 = [189, 198, 203], D0 = [62, 103, 252];
    for (let y = 0; y < SPR; y++) {
      for (let x = 0; x < SPR; x++) {
        const i = (y * SPR + x) * 4, a = src[i + 3];
        if (!a) continue;
        const r = src[i], gg = src[i + 1], b = src[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        const sat = mx ? (mx - mn) / mx : 0, hue = rgbHue(r, gg, b);
        let ref, tgt;
        if (sat > 0.3 && hue >= 190 && hue <= 275) { ref = D0; tgt = decal; }
        else {
          const isTrim = (y >= 42 && (x < 23 || x > 42)) || y <= 10;
          ref = B0; tgt = isTrim ? trim : body;
        }
        d[i] = clamp(r * tgt[0] / ref[0], 0, 255);
        d[i + 1] = clamp(gg * tgt[1] / ref[1], 0, 255);
        d[i + 2] = clamp(b * tgt[2] / ref[2], 0, 255);
        d[i + 3] = a;
      }
    }
    g.putImageData(out, 0, 0);
    shapeShip(g, trim);
  }

  // Ship types reshape the recoloured sprite. The feet stay where HULL expects them
  // (within a few px), so every ship shares the same landing physics.
  function shapeShip(g, trim) {
    const id = shipDef.id;
    if (id === 'classic') return;
    const t = makeCanvas(SPR, SPR);
    t.getContext('2d').drawImage(shipCanvas, 0, 0);
    g.imageSmoothingEnabled = false;
    if (id === 'dart') {
      // slim fuselage, fins tucked in
      g.clearRect(0, 11, SPR, SPR - 11);
      g.drawImage(t, 13, 42, 10, 22, 16, 42, 10, 22);
      g.drawImage(t, 42, 42, 10, 22, 39, 42, 10, 22);
      g.drawImage(t, 22, 11, 20, 48, 25, 11, 14, 48);
    } else if (id === 'hauler') {
      // fat fuselage with two dark cargo bands
      g.drawImage(t, 22, 12, 20, 47, 19, 12, 26, 47);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(19, 19, 26, 2); g.fillRect(19, 43, 26, 2);
      g.globalCompositeOperation = 'source-over';
    } else if (id === 'gunship') {
      // a cannon barrel strapped to each side
      const shade = k => rgbStr(trim.map(v => clamp(v * k, 0, 255)));
      for (const x of [19, 43]) {
        g.fillStyle = shade(0.82); g.fillRect(x, 16, 1, 25);
        g.fillStyle = shade(0.45); g.fillRect(x + 1, 16, 1, 25);
        g.fillStyle = shade(1.1); g.fillRect(x, 14, 2, 2);
        g.fillStyle = shade(0.35);
        const strut = x < 32 ? x + 2 : x - 1;
        g.fillRect(strut, 28, 1, 2); g.fillRect(strut, 37, 1, 2);
      }
    }
  }

  let flamePal = null;
  function buildFlame() {
    const f = hexToRgb(cfg.flameColor), wht = [255, 255, 255];
    flamePal = {
      core: rgbStr(mixRgb(f, wht, 0.9)), core2: rgbStr(mixRgb(f, wht, 0.6)),
      hot: rgbStr(mixRgb(f, wht, 0.42)), base: rgbStr(f),
      outer: rgbStr([f[0] * 0.9, f[1] * 0.55, f[2] * 0.55]), tail: rgbStr(f.map(v => v * 0.5)),
      smoke: rgbStr(mixRgb(f, [226, 207, 180], 0.65))
    };
  }
  let turboT = 0;
  const isRainbow = () => cfg.flameStyle === 1 || turboT > 0 || (up.rainbow > 0 && rainbowOn);

  const rocketCanvas = makeCanvas(SPR, SPR + FLAME_ROOM);
  const rctx = rocketCanvas.getContext('2d');

  function composeRocket() {
    rctx.clearRect(0, 0, rocketCanvas.width, rocketCanvas.height);
    const th = rocket.thrust;
    if (th > 0.03) {
      const rb = isRainbow();
      const flick = 0.8 + 0.25 * Math.sin(time * 41) * Math.sin(time * 23.7) + Math.random() * 0.12;
      const len = Math.max(2, Math.round(th * 28 * flick));
      for (let i = 0; i < len; i++) {
        const f = i / len;
        let w = Math.max(1, Math.round(7 * Math.pow(1 - f, 0.75) * (0.9 + Math.random() * 0.25)));
        rctx.fillStyle = rb ? rgbStr(hslRgb(time * 360 + i * 22, 1, 0.58))
          : f < 0.22 ? flamePal.hot : f < 0.5 ? flamePal.base : f < 0.78 ? flamePal.outer : flamePal.tail;
        rctx.fillRect(NOZZLE_X - Math.ceil(w / 2), NOZZLE_Y + i, w, 1);
        const cw = w - 4;
        if (cw > 0 && f < 0.6) {
          rctx.fillStyle = rb ? rgbStr(hslRgb(time * 360 + i * 22, 1, 0.85)) : f < 0.28 ? flamePal.core : flamePal.core2;
          rctx.fillRect(NOZZLE_X - Math.ceil(cw / 2), NOZZLE_Y + i, cw, 1);
        }
      }
    }
    rctx.drawImage(shipCanvas, 0, 0);
  }

  // ================================================================ particles
  const particles = [];
  const MAX_PARTICLES = 900;

  function spawn(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt / p.life;
      if (p.age >= 1) { particles.splice(i, 1); continue; }
      const drag = Math.pow(p.drag, dt * 60);
      p.vx *= drag; p.vy *= drag;
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.noGround) continue;
      const gy = groundY(p.x);
      if (p.y > gy) {
        p.y = gy;
        if (!p.hit) {
          p.hit = true;
          const push = Math.abs(p.vy) * (0.6 + Math.random() * 0.6);
          p.vx += (wd(p.x - rocket.x) < 0 ? -1 : 1) * push + rand(-6, 6);
        }
        p.vy = -Math.abs(p.vy) * 0.08;
      }
    }
  }

  function drawParticles(front) {
    for (const p of particles) {
      if ((p.kind === 'dust' || !!p.front) !== front) continue;
      const a = p.age;
      const size = Math.max(1, Math.round(lerp(p.s0, p.s1, a)));
      const x = Math.round(sxOf(p.x) - size / 2), y = Math.round(syOf(p.y) - size / 2);
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) continue;
      let col, alpha;
      if (p.kind === 'fire') {
        if (p.hue != null) col = a < 0.3 ? rgbStr(hslRgb(p.hue, 1, 0.65)) : a < 0.45 ? '#e2cfb4' : '#a9a6b4';
        else col = a < 0.12 ? flamePal.core : a < 0.25 ? flamePal.base : a < 0.42 ? flamePal.smoke : '#a9a6b4';
        alpha = (1 - a) * 0.85;
      } else if (p.kind === 'spark') {
        col = p.col || (a < 0.5 ? '#ffe28a' : '#ff8a3a');
        alpha = 1 - a;
      } else if (p.kind === 'sparkle') {
        col = p.col;
        alpha = (1 - a) * (Math.sin(time * 40 + p.ph) > -0.3 ? 1 : 0.25);
      } else if (p.kind === 'debris') {
        col = p.col;
        alpha = a < 0.7 ? 1 : (1 - a) / 0.3;
      } else {
        col = p.col || '#b9b6c4';
        alpha = (1 - a) * 0.7;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function kickDust(x, count, strength) {
    for (let i = 0; i < count; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const px = x + dir * rand(0, 10) * RS;
      spawn({
        kind: 'dust', x: px, y: groundY(px) - 1,
        vx: dir * rand(0.2, 1) * H * 0.35 * strength, vy: -rand(0.02, 0.2) * H * strength,
        g: H * 0.12, drag: 0.94, life: rand(0.8, 1.8), age: 0, s0: 1, s1: rand(2, 4),
        col: Math.random() < 0.5 ? '#c9c6d3' : '#a19eac', hit: true
      });
    }
  }

  function debrisBurst(x, y, count, spread, baseVx, baseVy, cols) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * TAU, sp = rand(0.2, 1) * spread;
      spawn({
        kind: 'debris', front: true, x, y,
        vx: Math.cos(ang) * sp + baseVx, vy: Math.sin(ang) * sp + baseVy,
        g: H * 0.05, drag: 0.985, life: rand(0.6, 1.6), age: 0,
        s0: rand(1, 2.5), s1: 1, col: cols[(Math.random() * cols.length) | 0], hit: true
      });
    }
  }

  const STAR_COLS = ['#ffffff', '#fff3b0', '#cfe0ff', '#ffd8e4', '#ffe066'];
  function sparkleBurst(x, y, n, speed, vx = 0, vy = 0) {
    for (let k = 0; k < n; k++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 1) * speed;
      spawn({
        kind: 'sparkle', front: true, x, y, vx: Math.cos(ang) * sp + vx, vy: Math.sin(ang) * sp + vy,
        g: H * 0.02, drag: 0.94, life: rand(0.6, 1.4), age: 0, s0: rand(1, 2), s1: 1,
        col: STAR_COLS[(Math.random() * STAR_COLS.length) | 0], ph: Math.random() * TAU, hit: true
      });
    }
  }

  // ================================================================ shooting stars
  const shooting = [];
  let shootTimer = rand(4, 12);

  function spawnShootingStar(x, y, dir, ang, len, life) {
    shooting.push({ x, y, vx: Math.cos(ang) * dir * H * 1.1, vy: Math.sin(ang) * H * 1.1, len, age: 0, life });
  }

  function updateShooting(dt, randomSpawns) {
    if (cfg.shootingStars && randomSpawns) {
      shootTimer -= dt;
      if (shootTimer <= 0) {
        shootTimer = rand(6, 18);
        spawnShootingStar(cam.x + rand(0.1, 0.9) * W, cam.y + rand(0.04, 0.35) * H,
          Math.random() < 0.5 ? -1 : 1, rand(0.3, 0.6), rand(12, 26) * S, rand(0.5, 0.9));
      }
    }
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.age > s.life) shooting.splice(i, 1);
    }
  }

  function drawShooting() {
    ctx.fillStyle = '#ffffff';
    for (const s of shooting) {
      const sp = Math.hypot(s.vx, s.vy);
      const ux = s.vx / sp, uy = s.vy / sp;
      const fade = Math.sin(Math.PI * clamp(s.age / s.life, 0, 1));
      for (let i = 0; i < s.len; i++) {
        const wx = s.x - ux * i, wy = s.y - uy * i;
        if (wy > groundY(wx) - 1) continue;
        const x = Math.round(sxOf(wx)), y = Math.round(syOf(wy));
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        ctx.globalAlpha = fade * (1 - i / s.len);
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function shootingHit(px, py, radius) {
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const ux = s.vx / sp, uy = s.vy / sp;
      const dx = wd(px - s.x), dy = py - s.y;
      const t = clamp(-dx * ux - dy * uy, 0, s.len);
      if (Math.hypot(dx + ux * t, dy + uy * t) < radius) return i;
    }
    return -1;
  }

  function catchShooting(i) {
    const s = shooting[i];
    shooting.splice(i, 1);
    score.stars++;
    earn(5, s.x, s.y);
    sparkleBurst(s.x, s.y, 28, H * 0.3, s.vx * 0.15, s.vy * 0.15);
  }

  // ================================================================ asteroids
  const ASTEROID_R = [4, 7, 11];
  const asteroids = [];
  let astTimer = rand(6, 14);
  const ROCK_COLS = ['#8a7f75', '#6e6762', '#a39a8e', '#5a5452'];

  function makeAsteroidSprite(r, seed) {
    const rng = mulberry32(seed);
    const size = Math.ceil(r * 2) + 3, c = size / 2;
    const cv = makeCanvas(size, size), g = cv.getContext('2d');
    const img = g.createImageData(size, size), d = img.data;
    const harm = [2, 3, 5].map((k, i) => ({ k, amp: [0.09, 0.06, 0.04][i] * (0.6 + rng() * 0.8), ph: rng() * TAU }));
    const craters = [];
    const nC = 1 + Math.floor(r / 3.5 + rng() * 2);
    for (let i = 0; i < nC; i++) {
      const ang = rng() * TAU, dist = rng() * r * 0.55;
      craters.push({ x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, r: r * (0.14 + rng() * 0.16) + 0.6 });
    }
    const bases = [[124, 114, 104], [112, 108, 120], [130, 116, 94], [106, 100, 98]];
    const base = bases[(rng() * bases.length) | 0];
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const dx = px + 0.5 - c, dy = py + 0.5 - c;
        const dd = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
        let R = r * 0.84;
        for (const h of harm) R += r * h.amp * Math.sin(h.k * th + h.ph);
        if (dd > R) continue;
        const nx = dx / (R + 0.5), ny = dy / (R + 0.5);
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        let b = clamp(0.3 + 0.8 * (-0.6 * nx - 0.5 * ny + 0.62 * nz), 0.12, 1.2);
        for (const cr of craters) {
          const cd = Math.hypot(dx - cr.x, dy - cr.y);
          if (cd < cr.r) b *= 0.72 + 0.28 * clamp((dx - cr.x) / cr.r, -1, 1);
          else if (cd < cr.r + 0.9) b *= 1.12;
        }
        if (R - dd < 1) b *= 0.72;
        b = Math.floor(b * 6 + bayer(px, py)) / 6;
        const i = (py * size + px) * 4;
        d[i] = clamp(base[0] * b, 0, 255); d[i + 1] = clamp(base[1] * b, 0, 255); d[i + 2] = clamp(base[2] * b, 0, 255);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return { cv, c };
  }

  function spawnAsteroid(o) {
    if (asteroids.length >= 40) return;
    const r = Math.max(2, ASTEROID_R[o.size] * S);
    const seed = o.seed ?? ((Math.random() * 1e9) | 0);
    asteroids.push({
      x: o.x, y: o.y, vx: o.vx, vy: o.vy, g: o.g || 0,
      a: o.a ?? Math.random() * TAU, spin: o.spin ?? rand(-1.5, 1.5),
      size: o.size, r, spr: makeAsteroidSprite(r, seed), life: o.life ?? 14
    });
  }

  function spawnRandomAsteroid() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const size = Math.random() < 0.45 ? 2 : 1;
    const r = ASTEROID_R[size] * S, sp = H * rand(0.1, 0.22);
    spawnAsteroid({
      x: cam.x + (dir > 0 ? -r - 4 : W + r + 4), y: cam.y + rand(0.06, 0.42) * H,
      vx: dir * sp, vy: rand(-0.15, 0.25) * sp, size, life: (W + 2 * r + 20) / sp + 2
    });
  }

  function blastAsteroid(idx, ix, iy) {
    const a = asteroids[idx];
    asteroids.splice(idx, 1);
    score.rocks++;
    earn([2, 4, 7][a.size], a.x, a.y);
    const n = [10, 18, 30][a.size];
    debrisBurst(a.x, a.y, n, H * 0.12 * (a.size + 1) * 0.6, a.vx * 0.5 + ix, a.vy * 0.5 + iy, ROCK_COLS);
    for (let i = 0; i < n / 2; i++) {
      spawn({
        kind: 'spark', front: true, x: a.x + rand(-a.r, a.r) * 0.5, y: a.y + rand(-a.r, a.r) * 0.5,
        vx: rand(-1, 1) * H * 0.15, vy: rand(-1, 1) * H * 0.15, g: 0, drag: 0.93,
        life: rand(0.25, 0.6), age: 0, s0: 2, s1: 1, hit: true
      });
    }
    flash = Math.max(flash, 0.12 * (a.size + 1));
    if (a.size > 0) {
      const sp = H * (0.08 + 0.04 * Math.random()), ang = Math.random() * TAU;
      for (const s of [-1, 1]) {
        spawnAsteroid({
          x: a.x + Math.cos(ang) * s * a.r * 0.4, y: a.y + Math.sin(ang) * s * a.r * 0.4,
          vx: a.vx + Math.cos(ang) * s * sp + ix * 0.25, vy: a.vy + Math.sin(ang) * s * sp + iy * 0.25,
          size: a.size - 1, g: H * 0.015
        });
      }
    }
  }

  function updateAsteroids(dt, randomSpawns) {
    if (cfg.asteroids && randomSpawns) {
      astTimer -= dt;
      if (astTimer <= 0) { astTimer = rand(8, 20); spawnRandomAsteroid(); }
    }
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      a.life -= dt;
      a.vy += a.g * dt;
      a.x += a.vx * dt; a.y += a.vy * dt;
      a.a += a.spin * dt;
      if (a.life <= 0 || a.y < -CEIL - 200 || a.y > H + 60) { asteroids.splice(i, 1); continue; }
      if (a.y + a.r * 0.6 > groundY(a.x)) {
        asteroids.splice(i, 1);
        kickDust(a.x, 14 + a.size * 14, 0.5 + a.size * 0.25);
        debrisBurst(a.x, groundY(a.x) - 1, 6 + a.size * 6, H * 0.1, 0, -H * 0.1, ROCK_COLS);
      }
    }
  }

  function drawAsteroids() {
    for (const a of asteroids) {
      const x = Math.round(sxOf(a.x)), y = Math.round(syOf(a.y));
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a.a);
      ctx.drawImage(a.spr.cv, -Math.round(a.spr.c), -Math.round(a.spr.c));
      ctx.restore();
    }
  }

  // ================================================================ rocket
  const rocket = {
    x: 0, y: 0, vx: 0, vy: 0, angle: 0, w: 0, thrust: 0,
    state: 'landed', timer: 2, plan: [], landX: 0,
    // auto | manual | drag | return | dead | abducted | taken
    mode: 'auto', grounded: false, sleepT: 0, airT: 0, blink: 0, deadT: 0, takenT: 0, abScale: 1,
    releaseT: 0, keysUsed: false, returnArmed: false, grabX: 0, grabY: 0
  };

  // Hull outline (sprite px relative to centre); third value marks the landing feet.
  const HULL = [
    [0, -32, 0], [-3, -20, 0], [4, -20, 0], [-7, -12, 0], [8, -12, 0], [-9, 0, 0], [10, 0, 0],
    [-9, 12, 0], [10, 12, 0], [-18, 24, 0], [19, 24, 0], [0, 26, 0], [-15, 31, 1], [15, 31, 1]
  ];

  function penetration(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    let m = -Infinity;
    for (const h of HULL) {
      const wx = x + (h[0] * c - h[1] * s) * RS, wy = y + (h[0] * s + h[1] * c) * RS;
      m = Math.max(m, wy - groundY(wx));
    }
    return m;
  }

  // Resting pose on the terrain: tilted to match the slope under both feet.
  function restPose(x) {
    const gl = groundY(x - 15 * RS), gr = groundY(x + 15 * RS);
    const a = clamp(Math.atan2(gr - gl, 30 * RS), -0.35, 0.35);
    let y = (gl + gr) / 2 - 31 * RS * Math.cos(a);
    y -= penetration(x, y, a);
    return { y, a };
  }
  const restY = x => restPose(x).y;

  function visibleRocket() { return rocket.mode !== 'dead' && rocket.mode !== 'taken'; }

  function resetRocket() {
    const x = clamp(Math.round(W * rand(0.25, 0.4)), 20 * RS, W - 20 * RS);
    const pose = restPose(x);
    Object.assign(rocket, {
      x, y: pose.y, vx: 0, vy: 0, angle: pose.a, w: 0, thrust: 0,
      state: 'landed', timer: 2, plan: [], landX: x,
      mode: 'auto', grounded: false, deadT: 0, abScale: 1, sleepT: 0, airT: 0
    });
  }

  function pickLandX() {
    const margin = W * 0.06 + 20 * RS;
    let x = rand(margin, W - margin);
    for (let i = 0; i < 12 && Math.abs(wd(x - rocket.x)) < W * 0.2; i++) x = rand(margin, W - margin);
    return Math.round(x);
  }

  function hoverPoint(x) {
    return { x, y: Math.max(H * 0.1, restY(x) - H * 0.22), final: true };
  }

  function planFlight() {
    const plan = [];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) plan.push({ x: rand(W * 0.08, W * 0.92), y: rand(H * 0.12, H * 0.52), final: false });
    rocket.landX = pickLandX();
    plan.push(hoverPoint(rocket.landX));
    rocket.plan = plan;
  }

  function nozzleWorld() {
    const dist = (NOZZLE_Y + 1 - HALF) * RS;
    return {
      x: rocket.x - Math.sin(rocket.angle) * dist, y: rocket.y + Math.cos(rocket.angle) * dist,
      dx: -Math.sin(rocket.angle), dy: Math.cos(rocket.angle)
    };
  }
  function noseWorld() {
    const dist = 33 * RS;
    return {
      x: rocket.x + Math.sin(rocket.angle) * dist, y: rocket.y - Math.cos(rocket.angle) * dist,
      dx: Math.sin(rocket.angle), dy: -Math.cos(rocket.angle)
    };
  }

  function spawnExhaust(dt) {
    if (rocket.thrust <= 0.08) return;
    const n = nozzleWorld();
    const hue = isRainbow() ? mod(time * 300, 360) : null;
    let count = rocket.thrust * 70 * RS * dt;
    while (count > 0) {
      if (count < 1 && Math.random() > count) break;
      count -= 1;
      const sp = H * rand(0.12, 0.22) * (0.5 + rocket.thrust);
      spawn({
        kind: Math.random() < 0.12 ? 'spark' : 'fire', hue,
        col: hue != null ? rgbStr(hslRgb(hue + 40, 1, 0.65)) : null,
        x: n.x + rand(-1.5, 1.5) * RS, y: n.y + rand(0, 2) * RS,
        vx: n.dx * sp + rocket.vx * 0.3 + rand(-1, 1) * H * 0.03,
        vy: n.dy * sp + rocket.vy * 0.3 + rand(-1, 1) * H * 0.03,
        g: 0, drag: 0.95, life: rand(0.4, 1.1), age: 0, s0: 1, s1: rand(2, 4) * (RS > 1 ? 1.5 : 1)
      });
    }
  }

  // ---------------------------------------------------------------- autopilot (random hops & flying home)
  function updateAuto(dt) {
    const sm = cfg.flightSpeed / 100;
    const maxSpeed = H * 0.32 * sm, maxForce = H * 0.45 * sm;
    let targetThrust = 0, targetAngle = 0, turnRate = 4;

    switch (rocket.state) {
      case 'landed': {
        rocket.timer -= dt;
        rocket.vx = rocket.vy = 0; rocket.w = 0;
        const pose = restPose(rocket.x);
        rocket.y = lerp(rocket.y, pose.y, Math.min(1, dt * 8));
        targetAngle = pose.a; turnRate = 10;
        if (rocket.timer <= 0) {
          if (!rocket.plan.length) planFlight();
          rocket.state = 'liftoff';
          kickDust(rocket.x, 30, 0.8);
        }
        break;
      }
      case 'liftoff': {
        targetThrust = 1;
        rocket.vx *= Math.max(0, 1 - dt * 3);
        rocket.vy = Math.max(rocket.vy - H * 0.2 * sm * dt, -maxSpeed * 0.8);
        rocket.x += rocket.vx * dt;
        rocket.y += rocket.vy * dt;
        targetAngle = Math.sin(time * 5.5) * 0.02;
        const alt = restY(rocket.x) - rocket.y;
        if (alt < H * 0.1 && Math.random() < dt * 40) kickDust(rocket.x, 2, 0.6);
        if (alt > H * 0.22) rocket.state = 'cruise';
        break;
      }
      case 'cruise': {
        if (!rocket.plan.length) { rocket.landX = pickLandX(); rocket.plan.push(hoverPoint(rocket.landX)); }
        const wp = rocket.plan[0];
        const dx = wd(wp.x - rocket.x), dy = wp.y - rocket.y;
        const dist = Math.hypot(dx, dy) || 1e-4;
        let want = maxSpeed;
        if (wp.final) want = maxSpeed * Math.min(1, dist / (H * 0.3));
        let sx = dx / dist * want - rocket.vx, sy = dy / dist * want - rocket.vy;
        const sl = Math.hypot(sx, sy);
        if (sl > maxForce) { sx = sx / sl * maxForce; sy = sy / sl * maxForce; }
        rocket.vx += sx * dt; rocket.vy += sy * dt;
        rocket.x += rocket.vx * dt; rocket.y += rocket.vy * dt;
        const speed = Math.hypot(rocket.vx, rocket.vy);
        targetThrust = 0.45 + 0.55 * Math.min(1, sl / maxForce);
        if (speed > maxSpeed * 0.12) {
          targetAngle = clamp(Math.atan2(rocket.vx, -rocket.vy), -1.9, 1.9);
          if (wp.final) targetAngle *= Math.min(1, speed / (maxSpeed * 0.5));
        }
        if (!wp.final && dist < H * 0.08) rocket.plan.shift();
        else if (wp.final && (dist < H * 0.04 || (dist < H * 0.08 && speed < maxSpeed * 0.15))) {
          rocket.plan.shift();
          rocket.landX = wp.x;
          rocket.state = 'descent';
        }
        break;
      }
      case 'descent': {
        const pose = restPose(rocket.landX);
        const step = wd(rocket.landX - rocket.x) * Math.min(1, dt * 2.2);
        rocket.vx = step / Math.max(dt, 1e-4);
        rocket.x += step;
        const remaining = pose.y - rocket.y;
        const targetVy = clamp(remaining * 0.9, H * 0.03, H * 0.2) * sm;
        rocket.vy += (targetVy - rocket.vy) * Math.min(1, dt * 2.5);
        rocket.y += rocket.vy * dt;
        targetAngle = pose.a * clamp(1 - remaining / (H * 0.15), 0, 1);
        targetThrust = 0.35 + 0.5 * clamp(1 - remaining / (H * 0.25), 0, 1);
        if (remaining < H * 0.08 && Math.random() < dt * 30) kickDust(rocket.x, 2, 0.5);
        if (rocket.y >= pose.y - 0.25) {
          rocket.x = rocket.landX; rocket.y = pose.y;
          rocket.vx = rocket.vy = 0;
          rocket.state = 'landed';
          rocket.timer = cfg.restTime * rand(0.75, 1.3);
          kickDust(rocket.x, 45, 1);
        }
        break;
      }
    }

    let da = targetAngle - rocket.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    rocket.angle += da * Math.min(1, dt * turnRate);
    rocket.thrust += (targetThrust - rocket.thrust) * Math.min(1, dt * 8);
    rocket.x = wrapX(rocket.x);
    rocket.y = Math.max(rocket.y, -CEIL + HALF * RS * 0.6);
    if (rocket.state !== 'landed') {
      const pen = penetration(rocket.x, rocket.y, rocket.angle);
      if (pen > 0) rocket.y -= pen;
    }
    spawnExhaust(dt);
  }

  // ---------------------------------------------------------------- clean loop
  const LOOP_FLIGHT = 13, LOOP_ACCEL = 0.18;
  let loop = null;
  let loopClock = 0, vOff = 0;
  const vClock = () => (cfg.flightMode === 0 ? loopClock + vOff : time);

  function loopTimes() {
    const flight = LOOP_FLIGHT / Math.max(0.25, cfg.flightSpeed / 100);
    const rest = Math.max(2.5, cfg.restTime);
    return { flight, rest, period: flight + rest };
  }

  function buildLoop(rng) {
    // flattest spot near the left third of the home screen
    let padX = Math.round(W * 0.3), best = Infinity;
    for (let x = Math.round(W * 0.22); x <= Math.round(W * 0.38); x += 2) {
      const sc = Math.abs(restPose(x).a);
      if (sc < best - 0.01) { best = sc; padX = x; }
    }
    const pose = restPose(padX);
    const padYc = pose.y;
    const up = Math.min(H * 0.2, padYc - H * 0.1);
    const r = (a, b) => a + rng() * (b - a);
    const pts = [
      [padX, padYc], [padX, padYc - up * 0.4], [padX, padYc - up],
      [r(0.5, 0.62) * W, r(0.18, 0.3) * H], [r(0.8, 0.9) * W, r(0.36, 0.5) * H],
      [r(0.6, 0.7) * W, r(0.1, 0.18) * H], [r(0.1, 0.16) * W, r(0.22, 0.34) * H],
      [padX, padYc - up], [padX, padYc - up * 0.4], [padX, padYc]
    ];
    const ext = [
      [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]], ...pts,
      [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0], 2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]]
    ];
    const xs = [], ys = [];
    const STEPS = 48;
    for (let s = 1; s < ext.length - 2; s++) {
      const p0 = ext[s - 1], p1 = ext[s], p2 = ext[s + 1], p3 = ext[s + 2];
      const k = (a, b) => Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
      const t0 = 0, t1 = t0 + k(p0, p1), t2 = t1 + k(p1, p2), t3 = t2 + k(p2, p3);
      for (let i = 0; i < STEPS; i++) {
        const t = t1 + (t2 - t1) * (i / STEPS);
        const pt = [0, 1].map(c => {
          const A1 = ((t1 - t) * p0[c] + (t - t0) * p1[c]) / (t1 - t0);
          const A2 = ((t2 - t) * p1[c] + (t - t1) * p2[c]) / (t2 - t1);
          const A3 = ((t3 - t) * p2[c] + (t - t2) * p3[c]) / (t3 - t2);
          const B1 = ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0);
          const B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
          return ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1);
        });
        xs.push(pt[0]); ys.push(pt[1]);
      }
    }
    xs.push(padX); ys.push(padYc);
    const cum = new Float64Array(xs.length);
    for (let i = 1; i < xs.length; i++) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);

    const shots = [0.3, 0.74].map(f => ({
      f, x: r(0.15, 0.85) * W, y: r(0.04, 0.3) * H,
      dir: rng() < 0.5 ? -1 : 1, ang: r(0.3, 0.6), len: r(12, 26) * S, life: r(0.5, 0.9)
    }));
    const rocks = [0.06, 0.5].map(f => ({
      f, dir: rng() < 0.5 ? -1 : 1, y0: r(0.08, 0.4) * H, y1: r(0.1, 0.45) * H,
      size: rng() < 0.5 ? 2 : 1, seed: (rng() * 1e9) | 0, spin: r(-1.2, 1.2)
    }));

    loop = { xs, ys, cum, L: cum[cum.length - 1], padX, padY: padYc, padA: pose.a, shots, rocks };
    loopClock = loopTimes().period - 1.5;
    vOff = 0;
    if (cfg.flightMode === 0) {
      rocket.x = padX; rocket.y = padYc; rocket.angle = pose.a; rocket.thrust = 0;
    }
  }

  function loopPos(u) {
    const a = LOOP_ACCEL, vmax = 1 / (1 - a);
    let d;
    if (u <= 0) d = 0;
    else if (u >= 1) d = 1;
    else if (u < a) d = vmax * u * u / (2 * a);
    else if (u < 1 - a) d = vmax * (a / 2 + (u - a));
    else { const w = 1 - u; d = 1 - vmax * w * w / (2 * a); }
    const target = d * loop.L, cum = loop.cum;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
    const f = clamp((target - cum[lo]) / (cum[hi] - cum[lo] || 1), 0, 1);
    return [lerp(loop.xs[lo], loop.xs[hi], f), lerp(loop.ys[lo], loop.ys[hi], f)];
  }

  function updateLoop(dt, drive) {
    const { flight, period } = loopTimes();
    const prev = loopClock;
    loopClock += dt;
    if (loopClock >= period) loopClock -= period * Math.floor(loopClock / period);
    const wrapped = loopClock < prev;
    const c = loopClock;
    const crossed = t => (wrapped ? (prev < t || c >= t) : (prev < t && c >= t));

    if (drive && wrapped) kickDust(loop.padX, 30, 0.8);
    if (drive && crossed(flight)) kickDust(loop.padX, 45, 1);
    for (const s of loop.shots) {
      if (crossed(s.f * period) && cfg.shootingStars) spawnShootingStar(s.x, s.y, s.dir, s.ang, s.len, s.life);
    }
    for (const k of loop.rocks) {
      if (crossed(k.f * period) && cfg.asteroids) {
        const dur = 0.38 * period, r = ASTEROID_R[k.size] * S;
        const x0 = k.dir > 0 ? -r - 6 : W + r + 6, x1 = k.dir > 0 ? W + r + 6 : -r - 6;
        spawnAsteroid({
          x: x0, y: k.y0, vx: (x1 - x0) / dur, vy: (k.y1 - k.y0) / dur,
          size: k.size, seed: k.seed, spin: k.spin, a: 0, life: dur + 0.5
        });
      }
    }
    if (!drive) return;

    let targetThrust = 0, targetAngle = loop.padA;
    if (c < flight) {
      const u = c / flight, du = 1 / (flight * 60), h = 1 / 60;
      const p = loopPos(u), pa = loopPos(u - du), pb = loopPos(u + du);
      const vx = (pb[0] - pa[0]) / (2 * h), vy = (pb[1] - pa[1]) / (2 * h);
      const ax = (pb[0] - 2 * p[0] + pa[0]) / (h * h), ay = (pb[1] - 2 * p[1] + pa[1]) / (h * h);
      rocket.x = p[0]; rocket.y = p[1]; rocket.vx = vx; rocket.vy = vy;
      if (Math.hypot(vx, vy) > H * 0.03) {
        const upright = 1 - smoothstep(1 - LOOP_ACCEL * 1.5, 1 - LOOP_ACCEL * 0.6, u);
        targetAngle = lerp(loop.padA, clamp(Math.atan2(vx, -vy), -1.9, 1.9), upright);
      }
      const a = LOOP_ACCEL;
      if (u < a) targetThrust = 1;
      else if (u > 1 - a) targetThrust = 0.4 + 0.5 * (u - (1 - a)) / a;
      else targetThrust = 0.45 + 0.55 * clamp(Math.hypot(ax, ay) / (H * 0.5), 0, 1);
      if (loop.padY - rocket.y < H * 0.08 && Math.random() < dt * 35) kickDust(rocket.x, 2, 0.6);
    } else {
      rocket.x = loop.padX; rocket.y = loop.padY; rocket.vx = rocket.vy = 0;
    }
    let da = targetAngle - rocket.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    rocket.angle += da * Math.min(1, dt * (c >= flight ? 10 : 5));
    rocket.w = 0;
    rocket.thrust += (targetThrust - rocket.thrust) * Math.min(1, dt * 8);
    if (c >= flight) rocket.thrust *= Math.max(0, 1 - dt * 12);
    spawnExhaust(dt);
  }

  // ================================================================ manual flight (rigid body)
  const score = { stars: 0, rocks: 0, ufos: 0, sputniks: 0, aliens: 0, landings: 0 };
  const keys = { up: false, left: false, right: false, down: false, fire: false, strafeL: false, strafeR: false };
  let lastKeyTime = -1e9;
  let lastInteract = -1e9;
  let hintT = 0, hintShown = false, hudAlpha = 0;
  let flash = 0, shake = 0;

  const GRAV = () => H * 0.10 * worldDef.grav * (cheat.lowGrav ? 0.4 : 1);
  const THRUST = () => H * 0.27 * (1 + 0.12 * up.engine) * shipDef.thrust * (turboT > 0 ? 1.35 : 1);
  // Side thrusters: gentle angular acceleration, capped spin, a little friction so taps
  // give small, controllable turns. Nothing pulls the ship back to level.
  const ROT_ACC = () => 2.4 * shipDef.turn * cfg.steering / 100;
  const ROT_MAX = 2.6;
  const STRAFE = () => H * 0.13 * shipDef.thrust * (turboT > 0 ? 1.35 : 1);

  // Little jets from the side of the hull opposite to the push (dir: 1 = pushing right).
  function spawnStrafePuffs(dir, dt) {
    if (Math.random() > dt * 60) return;
    const c = Math.cos(rocket.angle), s = Math.sin(rocket.angle), lx = -dir * 10, ly = rand(-6, 10);
    const sp = H * rand(0.12, 0.2);
    spawn({ kind: 'fire', col: isRainbow() ? rgbStr(hslRgb(time * 300, 1, 0.65)) : null,
      x: rocket.x + (lx * c - ly * s) * RS, y: rocket.y + (lx * s + ly * c) * RS,
      vx: -dir * c * sp + rocket.vx * 0.3, vy: -dir * s * sp + rocket.vy * 0.3,
      g: 0, drag: 0.9, life: rand(0.15, 0.35), age: 0, s0: 1, s1: 2 });
  }
  const impacts = { foot: 0, body: 0 };

  function noteInteract() {
    lastInteract = time;
    if (!hintShown) { hintShown = true; hintT = 7; }
  }

  // One pass of contact impulses between hull points and the terrain.
  function contactPass() {
    const I = 256 * RS * RS;           // moment of inertia (mass = 1)
    const ca = Math.cos(rocket.angle), sa = Math.sin(rocket.angle);
    let touching = 0, feet = 0;
    for (const [lx, ly, foot] of HULL) {
      const rx = (lx * ca - ly * sa) * RS, ry = (lx * sa + ly * ca) * RS;
      const px = rocket.x + rx, py = rocket.y + ry;
      const pen = py - groundY(px);
      if (pen > -0.75) { touching++; if (foot) feet++; }   // resting contact (within a pixel)
      if (pen <= 0) continue;
      // surface normal from the broad slope, not single-pixel jaggies (which would
      // twist the ship through the long lever arm); foot pads sit flatter still
      const gp = (groundY(px + 4) - groundY(px - 4)) / 8 * (foot ? 0.5 : 1);
      const nl = Math.hypot(gp, 1), nx = gp / nl, ny = -1 / nl;
      let vpx = rocket.vx - rocket.w * ry, vpy = rocket.vy + rocket.w * rx;
      const vn = vpx * nx + vpy * ny;
      const rn = rx * ny - ry * nx;
      const kn = 1 + rn * rn / I;          // inverse effective mass along the normal
      if (vn < 0) {
        if (foot) impacts.foot = Math.max(impacts.foot, -vn); else impacts.body = Math.max(impacts.body, -vn);
        const j = -(1 + 0.12) * vn / kn;
        rocket.vx += j * nx; rocket.vy += j * ny; rocket.w += rn * j / I;
        // friction
        const tx = -ny, ty = nx;
        vpx = rocket.vx - rocket.w * ry; vpy = rocket.vy + rocket.w * rx;
        const vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx;
        const jt = clamp(-vt / (1 + rt * rt / I), -0.8 * j, 0.8 * j);
        rocket.vx += jt * tx; rocket.vy += jt * ty; rocket.w += rt * jt / I;
      }
      // push out of the ground through the same effective mass, so a sunk foot
      // pivots the hull instead of lifting it straight up
      const lam = Math.min(pen, 4) * 0.5 / kn;
      rocket.x += nx * lam; rocket.y += ny * lam;
      rocket.angle += rn * lam / I;
    }
    return { touching, feet };
  }

  function takeControl() {
    if (!ground || rocket.mode === 'dead' || rocket.mode === 'drag' || rocket.mode === 'abducted' || rocket.mode === 'taken') return;
    if (rocket.mode !== 'manual') {
      rocket.mode = 'manual';
      const onGround = rocket.y >= restY(rocket.x) - 0.5 && Math.hypot(rocket.vx, rocket.vy) < H * 0.06;
      rocket.grounded = onGround;
      rocket.w = 0;
      if (onGround) { rocket.vx = rocket.vy = 0; }
      rocket.airT = 0;
    }
    rocket.keysUsed = true;
    lastKeyTime = time;
    noteInteract();
  }

  function startReturn() {
    const looping = cfg.flightMode === 0;
    const onGround = rocket.grounded;
    rocket.grounded = false;
    rocket.w = 0;
    if (looping && onGround && Math.abs(wd(rocket.x - loop.padX)) < 2) { finishReturn(); return; }
    rocket.mode = looping ? 'return' : 'auto';
    rocket.landX = looping ? loop.padX : pickLandX();
    rocket.plan = [hoverPoint(rocket.landX)];
    rocket.returnArmed = false;
    if (onGround) { rocket.state = 'landed'; rocket.timer = 0.4; } else rocket.state = 'cruise';
  }

  function finishReturn() {
    rocket.mode = 'auto';
    rocket.x = loop.padX; rocket.y = loop.padY; rocket.angle = loop.padA;
    rocket.vx = rocket.vy = rocket.w = 0;
    const old = loopClock;
    loopClock = loopTimes().flight + 0.01;               // resume at the start of the rest phase
    vOff = mod(vOff + old - loopClock, loopTimes().period); // keep Earth & stars continuous
  }

  function updateManual(dt) {
    const steering = keys.left || keys.right || keys.up || keys.strafeL || keys.strafeR;
    if (rocket.grounded) {
      if (!steering) {
        rocket.vx = rocket.vy = rocket.w = 0;
        rocket.thrust *= Math.max(0, 1 - dt * 10);
        idleCheck();
        return;
      }
      rocket.grounded = false;
      rocket.sleepT = 0;
      if (keys.up) kickDust(rocket.x, 20, 0.7);
    }

    if (keys.left) rocket.w -= ROT_ACC() * dt;
    if (keys.right) rocket.w += ROT_ACC() * dt;
    if (keys.down) rocket.w *= Math.max(0, 1 - dt * 4);
    // spin friction; the Gyro upgrade damps spin harder when you're not steering
    if (!keys.left && !keys.right) rocket.w *= Math.max(0, 1 - dt * (0.35 + 0.9 * up.gyro));
    rocket.w = clamp(rocket.w, -ROT_MAX, ROT_MAX);

    const th = keys.up ? THRUST() : 0, g = GRAV();
    // Q / E strafe thrusters push the ship sideways along its own left-right axis, without turning it
    const strafe = ((keys.strafeR ? 1 : 0) - (keys.strafeL ? 1 : 0)) * STRAFE();
    impacts.foot = impacts.body = 0;
    let touching = 0, feet = 0;
    const SUB = 4, h = dt / SUB;
    for (let i = 0; i < SUB; i++) {
      rocket.vx += (Math.sin(rocket.angle) * th + Math.cos(rocket.angle) * strafe) * h;
      rocket.vy += (-Math.cos(rocket.angle) * th + Math.sin(rocket.angle) * strafe + g) * h;
      rocket.x += rocket.vx * h; rocket.y += rocket.vy * h;
      rocket.angle += rocket.w * h;
      const c = contactPass();
      touching = c.touching; feet = c.feet;
      // landing-leg shock absorbers soak up the spin a one-foot touchdown creates;
      // they don't hold the ship up, so a badly tilted landing still tips over
      if (c.feet) rocket.w *= Math.max(0, 1 - h * 4);
    }
    rocket.angle = Math.atan2(Math.sin(rocket.angle), Math.cos(rocket.angle));
    rocket.x = wrapX(rocket.x);
    const top = -CEIL + 12 * RS;
    if (rocket.y < top) { rocket.y = top; rocket.vy = Math.max(0, rocket.vy); }
    const sp = Math.hypot(rocket.vx, rocket.vy), cap = H * 0.9;
    if (sp > cap) { rocket.vx *= cap / sp; rocket.vy *= cap / sp; }

    const legs = (1 + 0.25 * up.legs) * shipDef.hull;
    if (cfg.crashes && !cheat.god && (impacts.foot > H * 0.32 * legs || impacts.body > H * 0.17 * legs)) {
      if (shield.graceT > 0) { rocket.vy = Math.min(rocket.vy, 0) * 0.3; rocket.vx *= 0.5; }
      else if (shieldAbsorb()) { rocket.vy = -Math.min(Math.abs(rocket.vy) * 0.3, H * 0.08); rocket.vx *= 0.3; rocket.w *= 0.3; }
      else { explodeRocket(); return; }
    }
    if (impacts.foot + impacts.body > H * 0.04) kickDust(rocket.x, 8, 0.4);

    if (touching) {
      const pose = restPose(rocket.x);
      const tilt = Math.atan2(Math.sin(rocket.angle - pose.a), Math.cos(rocket.angle - pose.a));
      if (!steering && feet >= 2 && Math.abs(tilt) < 0.42 && sp < H * 0.08 && Math.abs(rocket.w) < 1.5) {
        // both legs down and within the balance limit: the legs bed in to match the ground
        const k = Math.min(1, dt * 6);
        rocket.w *= Math.max(0, 1 - dt * 10);
        rocket.vx *= Math.max(0, 1 - dt * 8); rocket.vy *= Math.max(0, 1 - dt * 8);
        rocket.angle += (pose.a - rocket.angle) * k;
        rocket.y += (pose.y - rocket.y) * k;
        rocket.sleepT += dt;
        if (rocket.sleepT > 0.35) settle(pose);
      } else if (!steering && touching >= 2 && sp < H * 0.015 && Math.abs(rocket.w) < 0.05) {
        // at rest some other way (e.g. lying on its side)
        rocket.sleepT += dt;
        if (rocket.sleepT > 0.3) settle(null);
      } else rocket.sleepT = 0;
    } else { rocket.sleepT = 0; rocket.airT += dt; }

    rocket.thrust += ((keys.up ? 1 : 0) - rocket.thrust) * Math.min(1, dt * 10);
    if (keys.up && restY(rocket.x) - rocket.y < H * 0.1 && Math.random() < dt * 35) kickDust(rocket.x, 2, 0.6);
    spawnExhaust(dt);
    if (strafe) spawnStrafePuffs(strafe > 0 ? 1 : -1, dt);
    idleCheck();
  }

  function settle(pose) {
    rocket.grounded = true;
    rocket.vx = rocket.vy = rocket.w = 0;
    if (pose) { rocket.angle = pose.a; rocket.y = pose.y; }
    if (rocket.airT > 1.2) {
      if (pose) { score.landings++; toast('NICE LANDING', 2); earn(10, rocket.x, rocket.y - 36 * RS); }
      else toast('HOUSTON, WE HAVE A PROBLEM', 2.5);
    }
    rocket.airT = 0;
  }

  // Autopilot (when switched on) takes over once the ship has been left alone for a while.
  function idleCheck() {
    if (!cfg.autopilot) return;
    if (keys.up || keys.left || keys.right || keys.down || keys.strafeL || keys.strafeR) return;
    const since = time - Math.max(lastKeyTime, rocket.releaseT, lastInteract);
    if (since > cfg.idleReturn) startReturn();
  }

  function toggleAutopilot() {
    cfg.autopilot = !cfg.autopilot;
    noteInteract();
    if (cfg.autopilot) {
      toast('AUTOPILOT ON', 1.6, '#7ff0ff');
      if (rocket.mode === 'manual') startReturn();          // engage right away
    } else {
      toast('AUTOPILOT OFF', 1.6, '#ffb36b');
      // hand the ship over wherever it is
      if (rocket.mode === 'return' || rocket.mode === 'auto') {
        const onGround = rocket.y >= restY(rocket.x) - 0.5 && Math.hypot(rocket.vx, rocket.vy) < H * 0.06;
        rocket.mode = 'manual';
        rocket.grounded = onGround;
        if (onGround) rocket.vx = rocket.vy = 0;
        rocket.w = 0; rocket.airT = 0; rocket.sleepT = 0;
        lastKeyTime = time;
      }
    }
  }

  // ---------------------------------------------------------------- drag & throw
  function hitRocket(wx, wy) {
    if (!visibleRocket() || rocket.mode === 'abducted') return false;
    const dx = wd(wx - rocket.x), dy = wy - rocket.y;
    const c = Math.cos(rocket.angle), s = Math.sin(rocket.angle);
    const lx = (dx * c + dy * s) / RS, ly = (-dx * s + dy * c) / RS;
    if (ly < -35 || ly > 34) return false;
    return Math.abs(lx) <= (ly < 8 ? 12 : 21);
  }

  function startDrag(wx, wy) {
    rocket.mode = 'drag';
    rocket.grounded = false;
    rocket.grabX = wd(rocket.x - wx);
    rocket.grabY = rocket.y - wy;
    rocket.vx = rocket.vy = rocket.w = 0;
    noteInteract();
  }

  function updateDrag(dt) {
    const tx = mouse.wx + rocket.grabX;
    const ty = Math.max(-CEIL + 12 * RS, mouse.wy + rocket.grabY);
    const k = Math.min(1, dt * 18);
    const nx = rocket.x + wd(tx - rocket.x) * k, ny = lerp(rocket.y, ty, k);
    const iv = Math.min(1, dt * 12);
    rocket.vx = lerp(rocket.vx, wd(nx - rocket.x) / Math.max(dt, 1e-3), iv);
    rocket.vy = lerp(rocket.vy, (ny - rocket.y) / Math.max(dt, 1e-3), iv);
    rocket.x = wrapX(nx); rocket.y = ny;
    const target = clamp(rocket.vx / (H * 1.2), -0.7, 0.7);
    const oldA = rocket.angle;
    rocket.angle += (target - rocket.angle) * Math.min(1, dt * 8);
    rocket.w = lerp(rocket.w, (rocket.angle - oldA) / Math.max(dt, 1e-3), iv);
    const pen = penetration(rocket.x, rocket.y, rocket.angle);
    if (pen > 0) rocket.y -= pen;
    rocket.thrust *= Math.max(0, 1 - dt * 8);
    lastInteract = time;
  }

  function endDrag() {
    if (rocket.mode !== 'drag') return;
    const sp = Math.hypot(rocket.vx, rocket.vy), cap = H * 1.1;
    if (sp > cap) { rocket.vx *= cap / sp; rocket.vy *= cap / sp; }
    rocket.mode = 'manual';
    rocket.releaseT = time;
    rocket.keysUsed = false;
    rocket.grounded = false;
    rocket.sleepT = 0;
    rocket.airT = 0;
  }

  // ---------------------------------------------------------------- crash & respawn
  function explodeRocket() {
    if (cheat.god) return;
    const x = rocket.x, y = rocket.y;
    rocket.mode = 'dead';
    rocket.deadT = 0;
    rocket.thrust = 0;
    for (let i = 0; i < 70; i++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.45) * H;
      spawn({ kind: 'fire', front: true, x: x + rand(-8, 8) * RS, y: y + rand(-14, 14) * RS,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - H * 0.05, g: -H * 0.02, drag: 0.93,
        life: rand(0.5, 1.4), age: 0, s0: 2, s1: rand(4, 7), hit: true });
    }
    for (let i = 0; i < 35; i++) {
      const ang = Math.random() * TAU, sp = rand(0.2, 0.7) * H;
      spawn({ kind: 'spark', front: true, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        g: H * 0.2, drag: 0.97, life: rand(0.4, 1), age: 0, s0: 1, s1: 1, hit: true });
    }
    debrisBurst(x, y, 30, H * 0.35, 0, -H * 0.15, [cfg.bodyColor, cfg.trimColor, '#5b6170', cfg.decalColor]);
    kickDust(x, 50, 1.2);
    flash = 1; shake = Math.max(shake, 0.8);
    if (credits > 0) earn(-Math.min(credits, 10), x, y - 20 * S);   // repair bill
  }

  function respawn() {
    if (cfg.flightMode === 0) finishReturn();
    else resetRocket();
    rocket.thrust = 0;
    rocket.abScale = 1;
    rocket.grounded = false;
    rocket.blink = 1.2;
    sparkleBurst(rocket.x, rocket.y, 24, H * 0.2);
  }

  // ================================================================ weapons & bullets
  // cd = seconds between shots, heat = heat added per shot (the weapon locks at 1.0)
  const WEAPONS = [
    { id: 'laser', name: 'LASER', desc: 'RELIABLE. THE LASER UPGRADE ADDS DOUBLE AND TRIPLE SHOT', cost: 0, cd: 0.16, heat: 0.08 },
    { id: 'scatter', name: 'SCATTER GUN', desc: 'FIVE PELLETS IN A CONE. SHORT RANGE, RUNS HOT', cost: 150, cd: 0.42, heat: 0.22 },
    { id: 'rail', name: 'RAILGUN', desc: 'PUNCHES THROUGH EVERYTHING IN LINE. SLOW, VERY HOT', cost: 300, cd: 0.7, heat: 0.4 },
    { id: 'missile', name: 'MISSILES', desc: 'HOMING. THE BLAST HITS EVERYTHING NEARBY', cost: 400, cd: 0.55, heat: 0.3 }
  ];
  let weaponDef = WEAPONS[0];
  const bullets = [];
  let fireCooldown = 0;
  // Weapon heat: every shot heats the gun and it cools on its own. At 100 % it overheats
  // and locks until it has cooled back down to HEAT_READY.
  const HEAT_COOL = 0.28, HEAT_READY = 0.3;
  let heat = 0, overheated = false;
  let muzzleSide = 1;

  function muzzleWorld() {
    if (shipDef.id !== 'gunship') return noseWorld();
    muzzleSide = -muzzleSide;                        // alternate the two side cannons
    const lx = 12.5 * muzzleSide, ly = -19, c = Math.cos(rocket.angle), s = Math.sin(rocket.angle);
    return { x: rocket.x + (lx * c - ly * s) * RS, y: rocket.y + (lx * s + ly * c) * RS, dx: s, dy: -c };
  }

  function tryFire() {
    if (fireCooldown > 0 || overheated || !visibleRocket() || rocket.mode === 'abducted') return;
    const wpn = weaponDef, turbo = turboT > 0, rb = isRainbow();
    fireCooldown = wpn.cd * (turbo ? 0.6 : Math.pow(0.85, Math.min(up.laser, 2)));
    if (!cheat.noHeat) {
      heat += wpn.heat * (turbo ? 0.5 : 1);
      if (heat >= 1) { heat = 1; overheated = true; toast('WEAPON OVERHEATED', 1.2, '#ff6b5b'); }
    }
    const n = muzzleWorld();
    const shot = (off, sp, life, extra) => {
      const a = rocket.angle + off;
      bullets.push(Object.assign({
        x: n.x, y: n.y, vx: Math.sin(a) * sp + rocket.vx, vy: -Math.cos(a) * sp + rocket.vy, life, len: 5,
        col: rb ? rgbStr(hslRgb(time * 400 + off * 900, 1, 0.65)) : cfg.laserColor
      }, extra));
    };
    if (wpn.id === 'scatter') {
      for (let i = 0; i < 5; i++) shot((i - 2) * 0.11 + rand(-0.04, 0.04), H * rand(0.95, 1.2), rand(0.28, 0.4), { len: 3 });
    } else if (wpn.id === 'rail') {
      shot(0, H * 3.2, 0.5, { len: 18, pierce: true, hit: new Set() });
      shake = Math.max(shake, 0.12);
    } else if (wpn.id === 'missile') {
      shot(0, H * 0.45, 1.8, { kind: 'missile', col: rb ? rgbStr(hslRgb(time * 400, 1, 0.65)) : '#ffb36b' });
    } else {
      const spread = turbo || up.laser >= 5 ? [-0.12, 0, 0.12] : up.laser >= 3 ? [-0.06, 0.06] : [0];
      for (const off of spread) shot(off, H * 1.3, 1.1);
    }
    spawn({ kind: 'spark', front: true, x: n.x, y: n.y, vx: n.dx * H * 0.1, vy: n.dy * H * 0.1,
      g: 0, drag: 0.9, life: 0.15, age: 0, s0: 2, s1: 1, hit: true });
  }

  // Homing missile: turns towards the nearest target and accelerates.
  function steerMissile(b, dt) {
    let best = null, bd = H * 0.7;
    const consider = (x, y) => { const d = Math.hypot(wd(x - b.x), y - b.y); if (d < bd) { bd = d; best = { x, y }; } };
    for (const a of asteroids) consider(a.x, a.y);
    for (const sn of sputniks) consider(sn.x, sn.y);
    for (const f of foes) if (f.a > 0.4) consider(f.x, f.y);
    if (ufo) consider(ufo.x, ufo.y);
    let sp = Math.hypot(b.vx, b.vy) || 1, ang = Math.atan2(b.vy, b.vx);
    if (best) {
      const want = Math.atan2(best.y - b.y, wd(best.x - b.x));
      const diff = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
      ang += clamp(diff, -5 * dt, 5 * dt);
    }
    sp = Math.min(H * 1.05, sp + H * 1.5 * dt);
    b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
    spawn({ kind: 'fire', x: b.x, y: b.y, vx: -b.vx * 0.15 + rand(-1, 1) * H * 0.02, vy: -b.vy * 0.15 + rand(-1, 1) * H * 0.02,
      g: 0, drag: 0.9, life: rand(0.2, 0.45), age: 0, s0: 1, s1: 2 });
  }

  // Missile blast: damages everything within the radius.
  function blastAt(x, y) {
    const R = 22 * S;
    for (let j = asteroids.length - 1; j >= 0; j--) {
      const a = asteroids[j];
      if (Math.hypot(wd(x - a.x), y - a.y) < R + a.r) blastAsteroid(j, wd(a.x - x) * 2, (a.y - y) * 2);
    }
    for (let j = sputniks.length - 1; j >= 0; j--) {
      const sn = sputniks[j];
      if (!sputHit(sn, x, y, R)) continue;
      damageSputnik(j);
      if (sputniks[j] === sn) damageSputnik(j);
    }
    for (let j = foes.length - 1; j >= 0; j--) {
      const f = foes[j];                       // a mine set off here can remove others, so re-check the index
      if (!f || !foeHit(f, x, y, R)) continue;
      damageFoe(j);
      if (foes[j] === f) damageFoe(j);
    }
    if (ufo && ufoHit(x, y, R)) { damageUfo(); damageUfo(); }
    for (let i = 0; i < 22; i++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.3) * H;
      spawn({ kind: i % 3 ? 'fire' : 'spark', front: true, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        g: 0, drag: 0.9, life: rand(0.25, 0.7), age: 0, s0: 2, s1: rand(3, 5), hit: true });
    }
    shake = Math.max(shake, 0.25);
  }

  function updateBullets(dt) {
    fireCooldown -= dt;
    if (heat > 0) heat = Math.max(0, heat - dt * HEAT_COOL * shipDef.cool * (overheated ? 1.5 : 1));
    if (overheated && heat <= HEAT_READY) overheated = false;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      let dead = b.life <= 0;
      const isMissile = b.kind === 'missile';
      if (isMissile && !dead) steerMissile(b, dt);
      const steps = b.pierce ? 6 : 3, k = b.pierce ? 0.04 : 0.12;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        let hit = false;
        for (let j = asteroids.length - 1; j >= 0; j--) {
          const a = asteroids[j];
          if (Math.hypot(wd(b.x - a.x), b.y - a.y) < a.r + 1.5) {
            if (!isMissile) blastAsteroid(j, b.vx * k, b.vy * k);
            hit = true; break;
          }
        }
        if ((!hit || b.pierce) && ufo && !(b.hit && b.hit.has(ufo)) && ufoHit(b.x, b.y, 0)) {
          if (b.hit) b.hit.add(ufo);
          if (!isMissile) { damageUfo(); if (b.pierce) damageUfo(); }
          hit = true;
        }
        for (let j = sputniks.length - 1; j >= 0 && (!hit || b.pierce); j--) {
          const sn = sputniks[j];
          if ((b.hit && b.hit.has(sn)) || !sputHit(sn, b.x, b.y, 1.5)) continue;
          if (b.hit) b.hit.add(sn);
          if (!isMissile) { damageSputnik(j, b.vx * k, b.vy * k); if (b.pierce && sputniks[j] === sn) damageSputnik(j); }
          hit = true;
        }
        for (let j = foes.length - 1; j >= 0 && (!hit || b.pierce); j--) {
          const f = foes[j];
          if (!f || (b.hit && b.hit.has(f)) || !foeHit(f, b.x, b.y, 1.5)) continue;
          if (b.hit) b.hit.add(f);
          if (!isMissile) { damageFoe(j, b.vx * k, b.vy * k); if (b.pierce && foes[j] === f) damageFoe(j); }
          hit = true;
        }
        if (hit && !b.pierce) dead = true;
        if (!dead && b.y > groundY(b.x)) {
          dead = true;
          for (let n = 0; n < 5; n++) spawn({ kind: 'spark', front: true, x: b.x, y: groundY(b.x) - 1,
            vx: rand(-1, 1) * H * 0.1, vy: -rand(0.05, 0.2) * H, g: H * 0.3, drag: 0.95,
            life: rand(0.2, 0.4), age: 0, s0: 1, s1: 1, hit: true });
          kickDust(b.x, isMissile ? 12 : 3, isMissile ? 0.6 : 0.3);
        }
      }
      if (dead && isMissile) blastAt(b.x, b.y);
      if (dead || b.y < -CEIL - 40) bullets.splice(i, 1);
    }
  }

  function drawBullets() {
    for (const b of bullets) {
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      const x = sxOf(b.x), y = syOf(b.y), len = b.len || 5;
      ctx.fillStyle = b.col;
      for (let i = 1; i < len; i++) {
        ctx.globalAlpha = 1 - i / len;
        ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
      }
      ctx.globalAlpha = 1;
      if (b.kind === 'missile') ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // ================================================================ UFO
  let ufo = null;
  let ufoTimer = rand(20, 40);
  const plasma = [];
  const escapees = [];
  const ufoUnit = () => Math.max(1, Math.round(S));

  function spawnUfo(forceHunt) {
    if (ufo || !ground) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    ufo = {
      x: cam.x + (side < 0 ? -40 * S : W + 40 * S), y: cam.y + H * rand(0.08, 0.2), vx: 0, vy: 0,
      state: 'enter', t: 0, hp: 3, hunt: visibleRocket() && (forceHunt || Math.random() < 0.7),
      tx: cam.x + rand(0.25, 0.75) * W, hitT: 0, angry: false, fireT: 1.2, carrying: false, beam: false
    };
  }

  function ufoHit(x, y, pad) {
    const u = ufoUnit();
    return Math.abs(wd(x - ufo.x)) < 15 * u + pad && Math.abs(y - ufo.y) < 7 * u + pad;
  }

  function ufoSteer(tx, ty, speed, dt) {
    const dx = wd(tx - ufo.x), dy = ty - ufo.y, d = Math.hypot(dx, dy) || 1;
    const want = Math.min(speed, d * 2);
    const k = Math.min(1, dt * 3);
    ufo.vx += (dx / d * want - ufo.vx) * k;
    ufo.vy += (dy / d * want - ufo.vy) * k;
  }

  function updateUfo(dt) {
    const playing = cfg.flightMode === 1 || rocket.mode !== 'auto' || time - lastInteract < 60;
    if (cfg.aliens && !ufo && playing && !boss) {
      ufoTimer -= dt;
      if (ufoTimer <= 0) { ufoTimer = rand(40, 90); spawnUfo(); }
    }

    for (let i = plasma.length - 1; i >= 0; i--) {
      const p = plasma[i];
      if (p.g) p.vy += p.g * dt;
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      let dead = p.life <= 0 || p.y > groundY(p.x);
      if (!dead && visibleRocket() && rocket.mode !== 'abducted' && Math.hypot(wd(p.x - rocket.x), p.y - rocket.y) < 12 * RS) {
        dead = true;
        if (shieldAbsorb()) { /* blocked */ }
        else if (cfg.crashes) explodeRocket();
        else if (rocket.mode === 'manual') { rocket.vx += p.vx * 0.5; rocket.vy += p.vy * 0.5; rocket.w += rand(-2, 2); rocket.grounded = false; }
      }
      if (dead) {
        for (let k = 0; k < 6; k++) spawn({ kind: 'spark', front: true, x: p.x, y: Math.min(p.y, groundY(p.x) - 1),
          vx: rand(-1, 1) * H * 0.12, vy: rand(-1, 0.3) * H * 0.12, g: 0, drag: 0.92, life: rand(0.2, 0.5), age: 0,
          s0: 2, s1: 1, col: p.col || '#9dff7a', hit: true });
        plasma.splice(i, 1);
      }
    }

    for (let i = escapees.length - 1; i >= 0; i--) {
      const e = escapees[i];
      e.t += dt; e.y -= H * 0.05 * dt; e.x += Math.sin(e.t * 2) * 6 * dt;
      if (e.t > 6) escapees.splice(i, 1);
    }

    if (rocket.mode === 'taken' && !ufo) {
      rocket.takenT -= dt;
      if (rocket.takenT <= 0) { respawn(); toast('RETURNED BY ALIENS: WRONG PLANET', 3); }
    }
    if (!ufo) return;

    const u = ufoUnit();
    ufo.t += dt; ufo.hitT -= dt;
    ufo.beam = false;
    const huntable = ufo.hunt && visibleRocket() && rocket.mode !== 'abducted';
    const tx = huntable ? rocket.x : ufo.tx;
    const ty = Math.max(-CEIL + 20 * S, (huntable ? rocket.y - 60 * S : groundY(tx) - 75 * S));

    if (ufo.angry && ufo.state !== 'leave' && visibleRocket() && rocket.mode !== 'abducted') {
      ufo.fireT -= dt;
      if (ufo.fireT <= 0) {
        ufo.fireT = 1.1;
        const dx = wd(rocket.x - ufo.x), dy = rocket.y - ufo.y, d = Math.hypot(dx, dy) || 1;
        plasma.push({ x: ufo.x, y: ufo.y + 3 * u, vx: dx / d * H * 0.32, vy: dy / d * H * 0.32, life: 4 });
      }
    }

    switch (ufo.state) {
      case 'enter':
        ufoSteer(tx, ty, H * 0.6, dt);
        if (Math.hypot(wd(tx - ufo.x), ty - ufo.y) < 12 * S) { ufo.state = 'hover'; ufo.t = 0; }
        break;
      case 'hover': {
        ufoSteer(tx, ty, H * 0.28, dt);
        const lined = !huntable || Math.abs(wd(tx - ufo.x)) < 3 * S || ufo.t > 4;
        if (ufo.t > 1.5 && lined && !ufo.angry) { ufo.state = 'beam'; ufo.t = 0; }
        if (ufo.t > 8) ufo.state = 'leave';
        break;
      }
      case 'beam': {
        ufoSteer(tx, ty, huntable ? H * 0.22 : H * 0.12, dt);
        ufo.beam = true;
        const gy = groundY(ufo.x);
        if (Math.random() < dt * 25) {
          const px = ufo.x + rand(-10, 10) * u;
          spawn({ kind: 'dust', x: px, y: groundY(px) - 1, vx: wd(ufo.x - px) * 0.3, vy: -H * rand(0.08, 0.18),
            g: 0, drag: 0.99, life: rand(1, 2), age: 0, s0: 1, s1: 2, col: '#c9ffc0', noGround: true, hit: true });
        }
        const inBeam = visibleRocket() && (rocket.mode === 'manual' || rocket.mode === 'auto' || rocket.mode === 'return')
          && rocket.y > ufo.y && rocket.y < gy + 5
          && Math.abs(wd(rocket.x - ufo.x)) < lerp(3, 12, clamp((rocket.y - ufo.y) / Math.max(1, gy - ufo.y), 0, 1)) * u + 6 * RS;
        if (inBeam) {
          rocket.mode = 'abducted';
          rocket.vx = rocket.vy = 0; rocket.thrust = 0; rocket.grounded = false;
          ufo.state = 'abducting'; ufo.t = 0;
          toast('BEAM ME UP!', 2);
        } else if (ufo.t > 4.5) ufo.state = 'leave';
        break;
      }
      case 'abducting': {
        ufo.vx *= 0.9; ufo.vy *= 0.9;
        ufo.beam = true;
        rocket.x = wrapX(rocket.x + wd(ufo.x - rocket.x) * Math.min(1, dt * 2));
        rocket.y -= H * 0.12 * dt;
        rocket.angle += 1.6 * dt;
        const dist = rocket.y - ufo.y;
        rocket.abScale = clamp(dist / (H * 0.2), 0.15, 1);
        if (dist < 8 * S) {
          rocket.mode = 'taken';
          ufo.carrying = true;
          ufo.state = 'leave';
          toast('ABDUCTED BY ALIENS', 2.5);
        }
        break;
      }
      case 'leave':
        ufo.vx += (wd(ufo.x - (cam.x + W / 2)) >= 0 ? 1 : -1) * H * 0.4 * dt;
        ufo.vy -= H * 0.5 * dt;
        if (ufo.y < cam.y - 80 * S || Math.abs(wd(ufo.x - (cam.x + W / 2))) > W) {
          if (ufo.carrying) rocket.takenT = 2.5;
          ufo = null;
          return;
        }
        break;
    }
    ufo.x = wrapX(ufo.x + ufo.vx * dt);
    ufo.y += ufo.vy * dt;
  }

  function damageUfo() {
    if (!ufo) return;
    ufo.hp--; ufo.hitT = 0.15; ufo.angry = true;
    for (let k = 0; k < 8; k++) spawn({ kind: 'spark', front: true, x: ufo.x, y: ufo.y,
      vx: rand(-1, 1) * H * 0.2, vy: rand(-1, 1) * H * 0.2, g: 0, drag: 0.92, life: rand(0.2, 0.5), age: 0, s0: 2, s1: 1, hit: true });
    if (ufo.state === 'beam') { ufo.state = 'hover'; ufo.t = 0; }
    if (ufo.hp <= 0) explodeUfo();
  }

  function explodeUfo() {
    const x = ufo.x, y = ufo.y;
    for (let i = 0; i < 50; i++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.4) * H;
      spawn({ kind: 'fire', front: true, x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: -H * 0.02, drag: 0.93,
        life: rand(0.4, 1.2), age: 0, s0: 2, s1: rand(3, 6), hit: true, noGround: true });
    }
    debrisBurst(x, y, 30, H * 0.3, ufo.vx, ufo.vy, ['#c9ced8', '#7d8494', '#9fe8ff', '#79e36f']);
    score.ufos++;
    earn(50, x, y);
    flash = Math.max(flash, 0.5); shake = Math.max(shake, 0.5);
    escapees.push({ x, y, t: 0 });
    if (rocket.mode === 'abducted' || rocket.mode === 'taken') {
      rocket.mode = 'manual';
      rocket.x = x; rocket.y = y + 14 * S; rocket.abScale = 1;
      rocket.vx = ufo.vx; rocket.vy = 0; rocket.w = rand(-1.5, 1.5);
      rocket.grounded = false; rocket.keysUsed = false; rocket.releaseT = time; rocket.airT = 0;
      toast('RESCUED!', 2);
      earn(25, x, y + 10 * S);
    } else toast('UFO DOWN', 2);
    ufo = null;
  }

  function drawUfoBeam() {
    if (!ufo || !ufo.beam) return;
    const u = ufoUnit();
    const x = sxOf(ufo.x), top = syOf(ufo.y) + 4 * u, bottom = syOf(groundY(ufo.x));
    ctx.fillStyle = '#b6ff9f';
    for (let y = Math.max(0, Math.round(top)); y < Math.min(H, bottom); y++) {
      const f = (y - top) / Math.max(1, bottom - top);
      const hw = lerp(3, 12, f) * u;
      ctx.globalAlpha = 0.14 + (Math.sin(y * 0.6 - time * 12) > 0.7 ? 0.14 : 0);
      ctx.fillRect(Math.round(x - hw), y, Math.round(hw * 2), 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawUfo() {
    if (!ufo) return;
    const u = ufoUnit();
    const cx = Math.round(sxOf(ufo.x)), cy = Math.round(syOf(ufo.y) + Math.sin(time * 3) * 1.5 * u);
    if (cx < -40 * u || cx > W + 40 * u) return;
    const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(cx + x * u, cy + y * u, u, u); };
    const white = ufo.hitT > 0;
    // dome
    for (let y = -7; y <= -1; y++) for (let x = -6; x <= 6; x++) {
      if ((x * x) / 36 + ((y + 1) * (y + 1)) / 36 <= 1) { ctx.globalAlpha = 0.85; px(x, y, white ? '#ffffff' : '#7fd6e8'); }
    }
    ctx.globalAlpha = 1;
    // pilot
    for (let y = -5; y <= -1; y++) for (let x = -2; x <= 2; x++) {
      if (x * x + (y + 3) * (y + 3) <= 5) px(x, y, '#79e36f');
    }
    px(-1, -4, ufo.angry ? '#ff3b3b' : '#10131a'); px(1, -4, ufo.angry ? '#ff3b3b' : '#10131a');
    px(-3, -5, '#e8fbff'); px(-2, -6, '#e8fbff');
    // saucer
    for (let y = -1; y <= 3; y++) for (let x = -15; x <= 15; x++) {
      if ((x * x) / 225 + ((y - 1) * (y - 1)) / 6.5 > 1) continue;
      let col = y < 0 ? '#e1e5ec' : y === 0 ? '#c9ced8' : y === 1 ? '#9aa1af' : '#6f7686';
      if (white) col = '#ffffff';
      px(x, y, col);
    }
    const lights = ['#ff5d5d', '#ffe066', '#7cff6b'];
    for (let k = 0; k < 7; k++) {
      const on = (Math.floor(time * 6) + k) % 3 === 0;
      px(-12 + k * 4, 1, on ? (ufo.angry ? '#ff3b3b' : lights[k % 3]) : '#4a4f5c');
    }
    px(0, 3, '#b7ffb0');
  }

  function drawPlasma() {
    for (const p of plasma) {
      const x = Math.round(sxOf(p.x)), y = Math.round(syOf(p.y));
      ctx.fillStyle = p.col || '#6dff4f'; ctx.globalAlpha = 0.5; ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.globalAlpha = 1; ctx.fillStyle = p.core || '#eaffdf'; ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // ================================================================ Sputniks (enemy squadrons)
  // They only show up while you're flying the ship yourself, circle you like
  // satellites, fire pellets, make diving ramming runs, and retreat if autopilot
  // takes over (so the idle loop stays untouched).
  const sputniks = [];
  let sputTimer = rand(18, 30);
  let wave = null;          // { size, killed }

  function spawnSputniks(n) {
    if (!ground || !visibleRocket()) return;
    n = Math.min(n, 6 - sputniks.length);
    if (n <= 0) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      sputniks.push({
        x: cam.x + (side < 0 ? -30 : W + 30) * S + side * i * 18 * S,
        y: cam.y + H * rand(0.08, 0.35),
        vx: -side * H * 0.2, vy: 0,
        orbitA: rand(0, TAU), orbitR: rand(60, 85) * S * RS, orbitW: rand(0.6, 1.0) * (Math.random() < 0.5 ? -1 : 1),
        state: 'orbit', t: 0, diveT: rand(4, 8), fireT: rand(1.2, 2.5), beepT: rand(0.5, 3),
        hp: 2, hitT: 0, life: 45
      });
    }
    wave = { size: n, killed: 0 };
    toast('INCOMING SPUTNIKS', 2, '#ff6b5b');
  }

  function sputHit(s, x, y, pad) {
    return Math.hypot(wd(x - s.x), y - s.y) < 5 * Math.max(1, Math.round(S)) + pad;
  }

  function damageSputnik(i, ix = 0, iy = 0) {
    const s = sputniks[i];
    s.hp--; s.hitT = 0.12;
    s.vx += ix * 0.3; s.vy += iy * 0.3;
    for (let k = 0; k < 6; k++) spawn({ kind: 'spark', front: true, x: s.x, y: s.y,
      vx: rand(-1, 1) * H * 0.18, vy: rand(-1, 1) * H * 0.18, g: 0, drag: 0.92, life: rand(0.2, 0.4), age: 0, s0: 2, s1: 1, hit: true });
    if (s.hp > 0) return;
    sputniks.splice(i, 1);
    for (let k = 0; k < 30; k++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.3) * H;
      spawn({ kind: 'fire', front: true, x: s.x, y: s.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: -H * 0.02,
        drag: 0.93, life: rand(0.3, 0.9), age: 0, s0: 2, s1: rand(3, 5), hit: true, noGround: true });
    }
    debrisBurst(s.x, s.y, 14, H * 0.25, s.vx * 0.5, s.vy * 0.5, ['#f2f4f8', '#c9ced8', '#8e95a3', '#ff5a5a']);
    flash = Math.max(flash, 0.2);
    score.sputniks++;
    earn(15, s.x, s.y);
    bossProgress(1);
    if (wave) {
      wave.killed++;
      if (wave.killed >= wave.size && wave.size > 1) {
        toast('SQUADRON DESTROYED', 2, '#9dff7a');
        earn(20, rocket.x, rocket.y - 40 * RS);
        wave = null;
      }
    }
  }

  function updateSputniks(dt) {
    const flying = rocket.mode === 'manual' || rocket.mode === 'drag';
    if (cfg.sputniks && flying && !sputniks.length && !NATIVES[worldDef.id] && !boss) {
      sputTimer -= dt;
      if (sputTimer <= 0) { sputTimer = rand(30, 60); spawnSputniks(1 + Math.floor(Math.random() * 3)); }
    }
    const target = visibleRocket() && rocket.mode !== 'abducted';
    const giveUp = !flying || !target;

    for (let i = sputniks.length - 1; i >= 0; i--) {
      const s = sputniks[i];
      s.t += dt; s.life -= dt; s.hitT -= dt;
      if (giveUp || s.life <= 0) s.state = 'leave';

      let ax = 0, ay = 0, maxSp = H * 0.32;
      if (s.state === 'orbit') {
        s.orbitA += s.orbitW * dt;
        s.orbitR = Math.max(45 * S * RS, s.orbitR - dt * 2 * S);        // slowly tighten the circle
        const tx = rocket.x + Math.cos(s.orbitA) * s.orbitR, ty = rocket.y + Math.sin(s.orbitA) * s.orbitR * 0.7;
        const dx = wd(tx - s.x), dy = ty - s.y;
        ax = dx * 3 - s.vx * 1.6; ay = dy * 3 - s.vy * 1.6;
        s.diveT -= dt;
        if (s.diveT <= 0) {
          s.state = 'dive'; s.t = 0;
          const ddx = wd(rocket.x - s.x), ddy = rocket.y - s.y, d = Math.hypot(ddx, ddy) || 1;
          s.vx = ddx / d * H * 0.55; s.vy = ddy / d * H * 0.55;
          floaters.push({ x: s.x, y: s.y - 8 * S, t: 0, text: 'BEEEEP', col: '#ff8a8a' });
        }
        s.fireT -= dt;
        if (s.fireT <= 0) {
          s.fireT = rand(1.6, 2.6);
          const ddx = wd(rocket.x - s.x), ddy = rocket.y - s.y, d = Math.hypot(ddx, ddy) || 1;
          if (d < W * 0.6) plasma.push({ x: s.x, y: s.y, vx: ddx / d * H * 0.3, vy: ddy / d * H * 0.3, life: 3, col: '#ff4040', core: '#ffe0e0' });
        }
      } else if (s.state === 'dive') {
        maxSp = H * 0.6;
        if (s.t > 1.1) { s.state = 'orbit'; s.diveT = rand(5, 9); s.orbitA = Math.atan2(s.y - rocket.y, wd(s.x - rocket.x)); }
      } else {        // leave: climb away and vanish
        ax = (s.vx >= 0 ? 1 : -1) * H * 0.4; ay = -H * 0.5; maxSp = H * 0.5;
        if (s.y < cam.y - 60 * S || Math.abs(wd(s.x - (cam.x + W / 2))) > W) { sputniks.splice(i, 1); continue; }
      }
      s.vx += ax * dt; s.vy += ay * dt;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > maxSp) { s.vx *= maxSp / sp; s.vy *= maxSp / sp; }
      s.x = wrapX(s.x + s.vx * dt); s.y += s.vy * dt;
      if (s.y > groundY(s.x) - 8 * S) { s.y = groundY(s.x) - 8 * S; s.vy = -Math.abs(s.vy) * 0.5; }

      s.beepT -= dt;
      if (s.beepT <= 0 && s.state !== 'leave') {
        s.beepT = rand(2.5, 5);
        floaters.push({ x: s.x, y: s.y - 8 * S, t: 0.3, text: 'BEEP', col: '#ff8a8a' });
      }
    }
    if (!sputniks.length) wave = null;
  }

  function drawSputniks() {
    const u = Math.max(1, Math.round(S));
    for (const s of sputniks) {
      const cx = Math.round(sxOf(s.x)), cy = Math.round(syOf(s.y));
      if (cx < -40 || cx > W + 40 || cy < -40 || cy > H + 40) continue;
      // four antennas trailing behind the direction of travel
      const back = Math.atan2(-s.vy, -s.vx || -0.001);
      ctx.fillStyle = s.hitT > 0 ? '#ffffff' : '#b8bec9';
      for (const off of [-0.5, -0.18, 0.18, 0.5]) {
        const a = back + off + Math.sin(time * 3 + off * 5) * 0.04;
        for (let d = 3; d <= 13; d++) ctx.fillRect(Math.round(cx + Math.cos(a) * d * u), Math.round(cy + Math.sin(a) * d * u), 1, 1);
      }
      // shaded sphere
      for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
        const r2 = x * x + y * y;
        if (r2 > 11) continue;
        const l = (-x - y) / 6 + (r2 < 4 ? 0.2 : 0);
        ctx.fillStyle = s.hitT > 0 ? '#ffffff' : l > 0.45 ? '#f2f4f8' : l > 0.05 ? '#c9ced8' : l > -0.35 ? '#8e95a3' : '#5d6370';
        ctx.fillRect(cx + x * u, cy + y * u, u, u);
      }
      // blinking red beacon
      if (Math.floor(time * 4 + s.orbitA) % 2) { ctx.fillStyle = '#ff3b3b'; ctx.fillRect(cx - u, cy - u, u, u); }
    }
  }

  function drawEscapees() {
    for (const e of escapees) {
      const x = Math.round(sxOf(e.x)), y = Math.round(syOf(e.y));
      ctx.globalAlpha = clamp(1 - (e.t - 4) / 2, 0, 1);
      ctx.fillStyle = '#79e36f';
      ctx.fillRect(x - 1, y - 4, 3, 2);         // head
      ctx.fillRect(x, y - 2, 1, 3);             // body
      const wave = Math.floor(e.t * 6) % 2;
      ctx.fillRect(x + 1, y - 1 - wave, 1, 1);  // waving arm
      ctx.fillRect(x - 1, y - 1, 1, 1);
      ctx.fillStyle = '#10131a';
      ctx.fillRect(x - 1, y - 4, 1, 1); ctx.fillRect(x + 1, y - 4, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================ natives & mines (planet-specific enemies)
  // Like the Sputniks, these only appear while the player is flying and leave when autopilot
  // takes over. Each world has its own natives; mines drift in anywhere.
  //   ai: walker (walks the terrain, shoots up) | hover (circles or sits above the ship, shoots)
  //       diver (lines up, then dashes through the ship) | blinker (teleports in, shoots, vanishes)
  //       mine (drifts closer, explodes next to the ship or when shot)
  //   shot: aim | spread (3 aimed) | drop (falls from above) | lob (arcs under gravity)
  const FOE_TYPES = {
    mine: { name: 'MINES', ai: 'mine', hp: 1, reward: 5, r: 4, count: [3, 5], col: '#ff5a3a',
      pal: { a: '#7d8496', c: '#c9ced8', k: '#3a3f4d', e: '#ff3b3b' },
      rows: ['k..k..k', '.kaaak.', '.aacaa.', 'kaceack', '.aaaaa.', '.kaaak.', 'k..k..k'] },
    sunsprite: { name: 'SUN SPRITES', ai: 'diver', hp: 1, reward: 12, r: 4, count: [2, 4], col: '#ff9a2a',
      pal: { a: '#ff9a2a', c: '#ffe07a', e: '#3a1400' },
      rows: ['..cac..', '.caaac.', 'caeaeac', 'aaaaaaa', 'caaaaac', '.caaac.', '..cac..'] },
    venusian: { name: 'VENUSIANS', ai: 'hover', above: true, hp: 3, reward: 18, r: 6, speed: 0.22, fire: [1.1, 2], shot: 'drop', count: [1, 2],
      col: '#c8f03a', cry: 'BLORP',
      pal: { a: '#e8d27a', b: '#b08a3a', c: '#fff3c0', e: '#ffffff', k: '#2a1c00' },
      rows: ['...ccc..cc...', '.ccaaaccaac..', 'caaaaaaaaaac.', 'caaekaaekaaac', 'caaaaaaaaaaac', '.baaabbaaabb.', '..bbb..bbb...'] },
    martian: { name: 'MARTIANS', ai: 'walker', hp: 3, reward: 20, r: 6, speed: 0.1, fire: [1.4, 2.4], shot: 'aim', shotSp: 0.42, count: [1, 2],
      col: '#ff5a3a', cry: 'ULLA',
      pal: { a: '#6fbf5a', b: '#3d7a3a', c: '#b8f0a0', e: '#ff3b3b', k: '#1d1b1f' },
      rows: ['...aaaaa...', '..acccaaa..', '.aaekeaaab.', '.aaaaaaabb.', '..abbbbbb..', '...b.b.b...', '..b..b..b..', '..b..b..b..',
        '.b...b...b.', '.b...b...b.', 'b....b....b'] },
    ionian: { name: 'IONIANS', ai: 'walker', hp: 2, reward: 15, r: 5, speed: 0.14, fire: [1.6, 2.8], shot: 'lob', count: [2, 3],
      col: '#ff9a2a', cry: 'HISS',
      pal: { a: '#e0582a', b: '#8a2c14', e: '#ffe07a', k: '#1d1b1f' },
      rows: ['a.........a', 'a..aaaaa..a', '.aaekaekaa.', '.aaaaaaaaa.', '..abbbbba..', '.b.b...b.b.', 'b..b...b..b'] },
    titan: { name: 'TITANS', ai: 'hover', orbitW: 0.35, hp: 4, reward: 22, r: 5, speed: 0.16, fire: [2, 3.2], shot: 'spread', count: [1, 2],
      col: '#ffb04a', cry: 'GLUB',
      pal: { a: '#d88a3a', b: '#8a5420', c: '#ffd9a0', e: '#2a1400' },
      rows: ['..ccccc..', '.caaaaac.', 'caaeaeaac', 'caaaaaaac', 'cabababac', '.b.b.b.b.', '.b.b.b.b.', '..b...b..', '..b...b..'] },
    mirandan: { name: 'MIRANDANS', ai: 'diver', hp: 1, reward: 12, r: 4, count: [3, 4], col: '#bff4ff',
      pal: { a: '#8fd8e8', b: '#4a9ab0', c: '#e8fcff', e: '#10303a' },
      rows: ['...c...', '..cac..', '..cac..', '.caaac.', '.caeac.', '.cabac.', '..bab..', '..bab..', '...b...'] },
    tritonian: { name: 'TRITONIANS', ai: 'hover', orbitW: 0.9, hp: 2, reward: 16, r: 5, speed: 0.34, fire: [1.4, 2.4], shot: 'aim', shotSp: 0.34, count: [2, 3],
      col: '#6f9bff', cry: 'BLUB',
      pal: { a: '#d77ab0', b: '#8a3a6a', e: '#ffffff' },
      rows: ['...aaa...', '..aaaaa..', '.aaeaaea.', '.aaaaaaa.', '.aaaaaaa.', '..aaaaa..', '.b.b.b.b.', '.b.b.b.b.', 'b..b.b..b'] },
    plutonian: { name: 'PLUTONIANS', ai: 'blinker', hp: 2, reward: 18, r: 5, shot: 'spread', shotSp: 0.28, count: [2, 3],
      col: '#d8b8ff', cry: 'STILL A PLANET',
      pal: { a: '#cdb8f0', e: '#ffffff', k: '#2a1c4a' },
      rows: ['a.......a', '.a.aaa.a.', '..aaaaa..', '.aaeeeaa.', '.aaekeaa.', '.aaeeeaa.', '..aaaaa..', '..a.a.a..', '.a..a..a.'] }
  };
  // Which natives live where. Worlds without natives (Moon, Earth) get Sputniks instead.
  const NATIVES = {
    mercury: 'sunsprite', venus: 'venusian', mars: 'martian', io: 'ionian',
    titan: 'titan', miranda: 'mirandan', triton: 'tritonian', pluto: 'plutonian'
  };
  const foes = [];
  let foeTimer = rand(12, 20);
  let foeWave = null;       // { size, killed }
  const foeUnit = () => 2 * Math.max(1, Math.round(S));     // sprites are drawn at twice the art-pixel scale
  const foeScale = def => foeUnit() * (def.scale || 1);     // bosses are bigger still

  function foeSprite(def) {
    if (def.spr) return def.spr;
    const w = def.rows[0].length, h = def.rows.length;
    const cv = makeCanvas(w, h), wh = makeCanvas(w, h), g = cv.getContext('2d'), g2 = wh.getContext('2d');
    g2.fillStyle = '#ffffff';
    def.rows.forEach((row, y) => {
      for (let x = 0; x < w; x++) {
        const col = def.pal[row[x]];
        if (!col) continue;
        g.fillStyle = col; g.fillRect(x, y, 1, 1); g2.fillRect(x, y, 1, 1);
      }
    });
    return (def.spr = { cv, wh, w, h });
  }

  function spawnFoes(type, n) {
    const def = FOE_TYPES[type];
    if (!def || !ground || !visibleRocket()) return;
    n = Math.min(n || Math.round(rand(def.count[0], def.count[1])), 8 - foes.length);
    if (n <= 0) return;
    const side = Math.random() < 0.5 ? -1 : 1, u = foeScale(def);
    for (let i = 0; i < n; i++) {
      const f = { type, def, hp: def.hp, hitT: 0, t: 0, st: 0, life: 50, state: 'hunt', sub: '', x: 0, y: 0, vx: 0, vy: 0, a: 1,
        fireT: def.fire ? rand(def.fire[0], def.fire[1]) : 0, cryT: rand(1, 5), oa: rand(0, TAU), phase: rand(0, TAU), wait: rand(1, 2.2) };
      if (def.ai === 'walker') {
        f.x = wrapX(cam.x + (side < 0 ? -20 * S : W + 20 * S) + side * i * 26 * S);
        f.y = groundY(f.x) - foeSprite(def).h * u / 2 + 1;
        f.keep = rand(55, 110) * S;
      } else if (def.ai === 'mine') {
        const ang = rand(-Math.PI, 0), dist = rand(85, 160) * S * RS;
        f.x = wrapX(rocket.x + Math.cos(ang) * dist);
        f.y = Math.min(rocket.y + Math.sin(ang) * dist, groundY(f.x) - 20 * S);
        f.a = 0;
      } else if (def.ai === 'blinker') {
        f.a = 0; f.sub = 'hidden'; f.wait = rand(0.2, 1.2);
      } else {
        f.x = wrapX(cam.x + (side < 0 ? -30 : W + 30) * S + side * i * 18 * S);
        f.y = cam.y + H * rand(0.08, 0.35);
        f.vx = -side * H * 0.2;
      }
      foes.push(f);
    }
    foeWave = { size: n, killed: 0 };
    toast(def.ai === 'mine' ? 'MINEFIELD AHEAD' : 'INCOMING ' + def.name, 2, '#ff6b5b');
  }

  function foeHit(f, x, y, pad) {
    return f.a > 0.4 && Math.hypot(wd(x - f.x), y - f.y) < f.def.r * foeScale(f.def) + pad;
  }

  // Something hit the ship: shield first, then a crash, otherwise a shove.
  function hurtRocket(kx, ky) {
    if (!visibleRocket() || rocket.mode === 'abducted' || shieldAbsorb()) return;
    if (cfg.crashes) explodeRocket();
    else if (rocket.mode === 'manual') { rocket.vx += kx; rocket.vy += ky; rocket.w += rand(-2, 2); rocket.grounded = false; }
  }

  function damageFoe(i, ix = 0, iy = 0, byPlayer = true) {
    const f = foes[i], def = f.def;
    f.hp--; f.hitT = 0.12;
    if (def.ai !== 'walker') { f.vx += ix * 0.3; f.vy += iy * 0.3; }
    for (let k = 0; k < 6; k++) spawn({ kind: 'spark', front: true, x: f.x, y: f.y, col: def.col,
      vx: rand(-1, 1) * H * 0.18, vy: rand(-1, 1) * H * 0.18, g: 0, drag: 0.92, life: rand(0.2, 0.4), age: 0, s0: 2, s1: 1, hit: true });
    if (f.hp > 0) return;
    foes.splice(i, 1);
    for (let k = 0; k < 24; k++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.3) * H;
      spawn({ kind: 'fire', front: true, x: f.x, y: f.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: -H * 0.02, col: k % 2 ? def.col : null,
        drag: 0.93, life: rand(0.3, 0.9), age: 0, s0: 2, s1: rand(3, 5), hit: true, noGround: true });
    }
    debrisBurst(f.x, f.y, 12, H * 0.25, f.vx * 0.5, f.vy * 0.5, Object.values(def.pal));
    flash = Math.max(flash, 0.15);
    if (def.boss) { bossDefeated(f); return; }
    if (byPlayer) {
      score.aliens++;
      earn(def.reward, f.x, f.y);
      bossProgress(1);
      if (foeWave && ++foeWave.killed >= foeWave.size && foeWave.size > 1) {
        toast(def.name + ' DEFEATED', 2, '#9dff7a');
        earn(20, rocket.x, rocket.y - 40 * RS);
        foeWave = null;
      }
    }
    if (def.ai === 'mine') {
      blastAt(f.x, f.y);                       // sets off rocks, enemies and other mines nearby
      const dx = wd(rocket.x - f.x), dy = rocket.y - f.y, d = Math.hypot(dx, dy) || 1;
      if (d < 42 * S * RS) hurtRocket(dx / d * H * 0.35, dy / d * H * 0.35);
    }
  }

  function foeFire(f) {
    const def = f.def, u = foeScale(def), oy = f.y - (def.ai === 'walker' ? foeSprite(def).h * u / 2 : 0);
    const dx = wd(rocket.x - f.x), dy = rocket.y - oy, d = Math.hypot(dx, dy) || 1;
    if (d > W * 0.7) return;
    const sp = H * (def.shotSp || 0.3);
    const shot = (vx, vy, g = 0) => plasma.push({ x: f.x, y: oy, vx, vy, g, life: 3.5, col: def.col, core: '#ffffff' });
    if (def.shot === 'drop') shot(rocket.vx * 0.3 + rand(-1, 1) * H * 0.03, H * 0.05, H * 0.3);
    else if (def.shot === 'lob') { const T = 1.5, g = H * 0.3; shot(dx / T, (dy - 0.5 * g * T * T) / T, g); }
    else if (def.shot === 'spread') { const a = Math.atan2(dy, dx); for (const o of [-0.28, 0, 0.28]) shot(Math.cos(a + o) * sp, Math.sin(a + o) * sp); }
    else shot(dx / d * sp, dy / d * sp);
  }

  // Spring towards a point, capped at maxSp, staying above the ground.
  function foeSteer(f, tx, ty, maxSp, dt) {
    f.vx += (wd(tx - f.x) * 3 - f.vx * 1.6) * dt; f.vy += ((ty - f.y) * 3 - f.vy * 1.6) * dt;
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > maxSp) { f.vx *= maxSp / sp; f.vy *= maxSp / sp; }
    foeMove(f, dt);
  }
  function foeMove(f, dt) {
    f.x = wrapX(f.x + f.vx * dt); f.y += f.vy * dt;
    const floor = groundY(f.x) - (f.def.r + 2) * foeScale(f.def);
    if (f.y > floor) { f.y = floor; f.vy = -Math.abs(f.vy) * 0.5; }
  }

  function updateFoes(dt) {
    const flying = rocket.mode === 'manual' || rocket.mode === 'drag';
    if (cfg.natives && flying && !foes.length && !boss) {
      foeTimer -= dt;
      if (foeTimer <= 0) {
        foeTimer = rand(22, 40);
        const nat = NATIVES[worldDef.id];
        spawnFoes(nat && Math.random() < 0.75 ? nat : 'mine');
      }
    }
    const giveUp = !flying || !visibleRocket() || rocket.mode === 'abducted';

    for (let i = foes.length - 1; i >= 0; i--) {
      const f = foes[i];
      if (!f) continue;               // a mine blast earlier in this loop can shorten the list
      const def = f.def, u = foeScale(def);
      f.t += dt; f.st += dt; f.life -= dt; f.hitT -= dt;
      if ((giveUp || f.life <= 0) && f.state !== 'leave') { f.state = 'leave'; f.st = 0; }
      const dx = wd(rocket.x - f.x), dy = rocket.y - f.y, d = Math.hypot(dx, dy) || 1;

      if (f.state === 'leave') {
        if (def.ai === 'walker' || def.move === 'ground') { f.y += H * 0.07 * dt * (def.scale || 1); if (f.st > 1.6) foes.splice(i, 1); }       // burrows away
        else if (def.ai === 'mine' || def.ai === 'blinker' || def.move === 'blink') { f.a -= dt * 1.5; if (f.a <= 0) foes.splice(i, 1); }
        else {
          f.vx += (f.vx >= 0 ? 1 : -1) * H * 0.4 * dt; f.vy -= H * 0.5 * dt;
          f.x = wrapX(f.x + f.vx * dt); f.y += f.vy * dt;
          if (f.y < cam.y - 60 * S || Math.abs(wd(f.x - (cam.x + W / 2))) > W) foes.splice(i, 1);
        }
        continue;
      }

      switch (def.ai) {
        case 'walker': {
          const want = Math.abs(dx) > f.keep ? Math.sign(dx) : Math.abs(dx) < f.keep * 0.6 ? -Math.sign(dx) : 0;
          f.x = wrapX(f.x + want * H * def.speed * dt);
          f.y = groundY(f.x) - foeSprite(def).h * u / 2 + 1;
          break;
        }
        case 'hover': {
          f.oa += (def.orbitW || 0) * dt;
          const R = (def.above ? 95 : 80) * S * RS;
          const tx = rocket.x + (def.above ? Math.sin(f.t * 0.7 + f.phase) * 30 * S : Math.cos(f.oa) * R);
          const ty = rocket.y + (def.above ? -R : Math.sin(f.oa) * R * 0.6);
          foeSteer(f, tx, ty, H * def.speed, dt);
          break;
        }
        case 'diver':
          if (f.sub !== 'dash') {              // line up beside the ship, then go
            foeSteer(f, rocket.x + Math.cos(f.oa) * 110 * S * RS, rocket.y - (20 + 70 * Math.abs(Math.sin(f.oa))) * S * RS, H * 0.4, dt);
            if (f.st > f.wait && d < W * 0.6) { f.sub = 'dash'; f.st = 0; f.vx = dx / d * H * 0.75; f.vy = dy / d * H * 0.75; }
          } else {
            foeMove(f, dt);
            if (Math.random() < dt * 40) spawn({ kind: 'fire', x: f.x, y: f.y, col: def.col, vx: rand(-1, 1) * H * 0.02, vy: rand(-1, 1) * H * 0.02,
              g: 0, drag: 0.9, life: rand(0.2, 0.5), age: 0, s0: 2, s1: 1 });
            if (f.st > 0.9) { f.sub = ''; f.st = 0; f.wait = rand(1.2, 2.4); f.oa = rand(0, TAU); }
          }
          break;
        case 'blinker':
          if (f.sub === 'hidden') {
            f.a = 0;
            if (f.st > f.wait) {
              const ang = rand(-Math.PI, 0), dist = rand(70, 115) * S * RS;
              f.x = wrapX(rocket.x + Math.cos(ang) * dist);
              f.y = Math.min(rocket.y + Math.sin(ang) * dist, groundY(f.x) - 12 * S);
              f.sub = 'in'; f.st = 0;
            }
          } else if (f.sub === 'in') { f.a = Math.min(1, f.st / 0.4); if (f.st > 0.4) { f.sub = 'aim'; f.st = 0; } }
          else if (f.sub === 'aim') { f.a = 1; if (f.st > 0.8) { foeFire(f); f.sub = 'out'; f.st = 0; } }
          else { f.a = Math.max(0, 1 - f.st / 0.4); if (f.st > 0.4) { f.sub = 'hidden'; f.st = 0; f.wait = rand(0.8, 1.8); } }
          break;
        case 'boss': updateBoss(f, dt, dx, dy, d); break;
        case 'mine':
          f.a = Math.min(1, f.a + dt * 2);
          f.x = wrapX(f.x + dx / d * H * 0.05 * dt); f.y += (dy / d * H * 0.05 + Math.sin(f.t * 2 + f.phase) * 3 * S) * dt;
          if (f.sub === 'fuse') { if (f.st > 0.45) { damageFoe(i, 0, 0, false); continue; } }
          else if (d < 32 * S * RS) { f.sub = 'fuse'; f.st = 0; }
          break;
      }

      if (def.fire && def.ai !== 'blinker') {
        f.fireT -= dt;
        if (f.fireT <= 0) { f.fireT = rand(def.fire[0], def.fire[1]); foeFire(f); }
      }
      if (def.cry && f.a > 0.5) {
        f.cryT -= dt;
        if (f.cryT <= 0) { f.cryT = rand(3, 7); floaters.push({ x: f.x, y: f.y - (def.r + 6) * u, t: 0.3, text: def.cry, col: def.col }); }
      }
    }
    if (!foes.length) foeWave = null;
    if (boss && !foes.includes(boss)) { boss = null; bossMeter = BOSS_AT - 3; }     // it got away: a few more kills bring it back
    if (bossDelay > 0 && flying) {
      bossDelay -= dt;
      if (bossDelay <= 0) spawnBoss();
    }
  }

  function drawFoes() {
    for (const f of foes) {
      const u = foeScale(f.def), spr = foeSprite(f.def), cx = Math.round(sxOf(f.x)), cy = Math.round(syOf(f.y));
      if (f.a <= 0 || cx < -80 || cx > W + 80 || cy < -80 || cy > H + 80) continue;
      const lit = f.hitT > 0 || (f.sub === 'fuse' && Math.floor(time * 16) % 2) || (f.sub === 'aim' && f.st > 0.6);
      ctx.globalAlpha = clamp(f.a, 0, 1);
      ctx.drawImage(lit ? spr.wh : spr.cv, cx - Math.round(spr.w * u / 2), cy - Math.round(spr.h * u / 2), spr.w * u, spr.h * u);
    }
    ctx.globalAlpha = 1;
  }

  // ================================================================ bosses (one per world)
  // A boss is a big foe (ai: 'boss') that lives in foes[], so bullets, missiles, blasts, clicks and
  // ramming hit it like any other enemy. Kills on a world fill the boss meter; at BOSS_AT the
  // world's boss arrives. It cycles through its `attacks`, gets faster below half health, and
  // leaves if autopilot takes over (rule: nothing fights the idle loop).
  //   move: hover (default) | above (sits over the ship) | ground (walks the terrain) | blink (teleports)
  //   attacks: burst | ring | rain | lob | charge | summon | mines
  const crowned = rows => {
    const w = rows[0].length, fill = t => ('.'.repeat((w - 5) >> 1) + t).padEnd(w, '.');
    return [fill('y.y.y'), fill('yyyyy'), ...rows];
  };
  const kingOf = (type, o) => {
    const base = FOE_TYPES[type];
    return { ai: 'boss', boss: true, scale: 3, minion: type, col: base.col, pal: { ...base.pal, y: '#ffd75a' }, rows: crowned(base.rows), ...o };
  };
  const BOSSES = {
    moon: { ai: 'boss', boss: true, scale: 3, name: 'SPUTNIK PRIME', hp: 30, reward: 150, col: '#ff4040', minion: 'sputnik',
      attacks: ['ring', 'burst', 'summon', 'charge'],
      pal: { a: '#c9ced8', b: '#8e95a3', c: '#f2f4f8', e: '#ff3b3b', k: '#3a0000' },
      rows: ['....ccc....', '..ccaaaaa..', '.caaaaaaab.', '.caaaaaaab.', 'caaeeeaaabb', 'caaekeaaabb', 'caaeeeaaabb', '.aaaaaaabb.',
        '.aaaaaabbb.', '..abbbbbb..', '....bbb....'] },
    earth: { ai: 'boss', boss: true, scale: 3, name: 'DEFENCE STATION', hp: 45, reward: 300, col: '#7ff0ff', minion: 'sputnik',
      attacks: ['burst', 'mines', 'burst', 'ring', 'summon'],
      pal: { a: '#c9ced8', b: '#6e7686', c: '#f2f4f8', d: '#3e67fc', e: '#ff3b3b', k: '#1d1b1f' },
      rows: ['......aaa......', 'ddd..aacaa..ddd', 'dcd.aaaaaaa.dcd', 'dddbaaekeaabddd', 'dcd.aaaaaaa.dcd', 'ddd..aabaa..ddd',
        '......aaa......', '.......b.......', '......bbb......'] },
    mercury: kingOf('sunsprite', { name: 'HELIOS', hp: 35, reward: 200, attacks: ['ring', 'charge', 'ring', 'summon'] }),
    venus: kingOf('venusian', { name: 'THE CLOUD QUEEN', hp: 40, reward: 250, move: 'above', attacks: ['rain', 'burst', 'rain', 'summon'] }),
    mars: kingOf('martian', { name: 'THE TRIPOD KING', hp: 40, reward: 250, move: 'ground', attacks: ['burst', 'lob', 'burst', 'summon'] }),
    io: kingOf('ionian', { name: 'THE MAGMA KING', hp: 40, reward: 250, move: 'ground', attacks: ['lob', 'ring', 'lob', 'summon'] }),
    titan: kingOf('titan', { name: 'THE KRAKEN', hp: 55, reward: 300, attacks: ['burst', 'ring', 'charge', 'summon'] }),
    miranda: kingOf('mirandan', { name: 'THE ICE QUEEN', hp: 35, reward: 300, attacks: ['charge', 'ring', 'charge', 'summon'] }),
    triton: kingOf('tritonian', { name: 'THE TRIDENT', hp: 45, reward: 350, attacks: ['burst', 'burst', 'ring', 'summon'] }),
    pluto: kingOf('plutonian', { name: 'THE NINTH PLANET', hp: 50, reward: 400, move: 'blink', attacks: ['ring', 'burst', 'summon'] })
  };
  for (const id in BOSSES) { const b = BOSSES[id]; b.r = Math.min(b.rows[0].length, b.rows.length) / 2 - 0.5; }
  const BOSS_AT = 8;                 // kills on a world before its boss shows up
  let boss = null, bossMeter = 0, bossDelay = 0;

  function bossProgress(n) {
    if (!cfg.bosses || boss || bossDelay > 0) return;
    bossMeter += n;
    if (bossMeter < BOSS_AT) return;
    bossMeter = BOSS_AT;
    bossDelay = 2.5;
    toast('WARNING: ' + BOSSES[worldDef.id].name + ' APPROACHES', 2.5, '#ff6b5b');
  }

  function spawnBoss() {
    const def = BOSSES[worldDef.id];
    bossDelay = 0;
    if (!def || boss || !ground || !visibleRocket()) return;
    const side = Math.random() < 0.5 ? -1 : 1, u = foeScale(def);
    const f = { type: 'boss', def, hp: def.hp, hitT: 0, t: 0, st: 0, life: 1e9, state: 'hunt', sub: '', vx: 0, vy: 0, a: 1,
      fireT: 2.5, cryT: 1e9, oa: rand(0, TAU), phase: rand(0, TAU), wait: 0.5, atk: 0, raged: false,
      x: wrapX(cam.x + (side < 0 ? -50 * S : W + 50 * S)), y: cam.y + H * 0.15, keep: 130 * S };
    if (def.move === 'ground') f.y = groundY(f.x) - foeSprite(def).h * u / 2 + 1;
    else if (def.move === 'blink') { f.a = 0; f.sub = 'hidden'; }
    else f.vx = -side * H * 0.2;
    foes.push(f);
    boss = f;
    shake = Math.max(shake, 0.4);
    toast(def.name, 2.5, '#ffd75a');
  }

  function bossAttack(f, atk, dx, dy, d) {
    const def = f.def, aim = Math.atan2(dy, dx), sp = H * 0.32;
    const shot = (vx, vy, g = 0, x = f.x) => plasma.push({ x, y: f.y, vx, vy, g, life: 4, col: def.col, core: '#ffffff' });
    switch (atk) {
      case 'burst': for (const o of [-0.36, -0.18, 0, 0.18, 0.36]) shot(Math.cos(aim + o) * sp, Math.sin(aim + o) * sp); break;
      case 'ring': {
        const n = 12, o = rand(0, TAU);
        for (let i = 0; i < n; i++) shot(Math.cos(o + i * TAU / n) * sp * 0.75, Math.sin(o + i * TAU / n) * sp * 0.75);
        break;
      }
      case 'rain': for (let i = -3; i <= 3; i++) shot(0, H * 0.05, H * 0.28, wrapX(rocket.x + (i * 34 + rand(-8, 8)) * S)); break;
      case 'lob': for (const T of [1.2, 1.6, 2]) { const g = H * 0.3; shot((dx + rand(-20, 20) * S) / T, (dy - 0.5 * g * T * T) / T, g); } break;
      case 'charge':
        if (def.move === 'ground' || def.move === 'blink') break;
        f.sub = 'charge'; f.st = 0; f.vx = dx / d * H * 0.6; f.vy = dy / d * H * 0.6;
        break;
      case 'summon':
        if (def.minion === 'sputnik') { if (sputniks.length < 3) spawnSputniks(2); }
        else if (foes.length < 5) spawnFoes(def.minion, 2);
        break;
      case 'mines': if (foes.length < 6) spawnFoes('mine', 3); break;
    }
  }

  function updateBoss(f, dt, dx, dy, d) {
    const def = f.def, rage = f.hp <= def.hp / 2;
    if (rage && !f.raged) { f.raged = true; shake = Math.max(shake, 0.5); toast(def.name + ' IS FURIOUS', 2, '#ff6b5b'); }
    if (f.sub === 'charge') {
      foeMove(f, dt);
      if (Math.random() < dt * 50) spawn({ kind: 'fire', x: f.x, y: f.y, col: def.col, vx: rand(-1, 1) * H * 0.03, vy: rand(-1, 1) * H * 0.03,
        g: 0, drag: 0.9, life: rand(0.3, 0.6), age: 0, s0: 3, s1: 1 });
      if (f.st > 1) { f.sub = ''; f.st = 0; }
      return;
    }
    if (def.move === 'ground') {
      const want = Math.abs(dx) > f.keep ? Math.sign(dx) : Math.abs(dx) < f.keep * 0.6 ? -Math.sign(dx) : 0;
      f.x = wrapX(f.x + want * H * (rage ? 0.12 : 0.08) * dt);
      f.y = groundY(f.x) - foeSprite(def).h * foeScale(def) / 2 + 1;
    } else if (def.move === 'blink') {
      if (f.sub === 'hidden') {
        f.a = 0;
        if (f.st > f.wait) {
          const ang = rand(-Math.PI, 0), dist = rand(100, 140) * S * RS;
          f.x = wrapX(rocket.x + Math.cos(ang) * dist);
          f.y = Math.min(rocket.y + Math.sin(ang) * dist, groundY(f.x) - (def.r + 2) * foeScale(def));
          f.sub = 'in'; f.st = 0;
        }
      } else if (f.sub === 'in') { f.a = Math.min(1, f.st / 0.4); if (f.st > 0.4) { f.sub = 'show'; f.st = 0; } }
      else if (f.sub === 'show') { f.a = 1; if (f.st > (rage ? 2.6 : 3.6)) { f.sub = 'out'; f.st = 0; } }
      else { f.a = Math.max(0, 1 - f.st / 0.4); if (f.st > 0.4) { f.sub = 'hidden'; f.st = 0; f.wait = rand(0.5, 1); } }
    } else {
      const R = 115 * S * RS;
      f.oa += 0.25 * dt;
      const tx = rocket.x + (def.move === 'above' ? Math.sin(f.t * 0.5 + f.phase) * 60 * S : Math.cos(f.oa) * R);
      const ty = rocket.y - (def.move === 'above' ? R : (30 + 55 * Math.abs(Math.sin(f.oa))) * S * RS);
      foeSteer(f, tx, ty, H * (rage ? 0.3 : 0.22), dt);
    }
    if (f.a < 0.9 || d > W * 0.8) return;
    f.fireT -= dt * (rage ? 1.6 : 1);
    if (f.fireT > 0) return;
    f.fireT = 2.3;
    bossAttack(f, def.attacks[f.atk++ % def.attacks.length], dx, dy, d);
  }

  function bossDefeated(f) {
    const def = f.def;
    boss = null; bossMeter = 0;
    for (let k = 0; k < 90; k++) {
      const ang = Math.random() * TAU, sp = rand(0.05, 0.55) * H, r = def.r * foeScale(def);
      spawn({ kind: k % 3 ? 'fire' : 'spark', front: true, x: f.x + rand(-r, r), y: f.y + rand(-r, r), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        g: -H * 0.02, col: k % 2 ? def.col : null, drag: 0.94, life: rand(0.5, 1.6), age: 0, s0: 3, s1: rand(4, 8), hit: true, noGround: true });
    }
    debrisBurst(f.x, f.y, 40, H * 0.4, 0, -H * 0.1, Object.values(def.pal));
    flash = 1; shake = Math.max(shake, 0.9);
    plasma.length = 0;
    score.aliens++;
    earn(def.reward, f.x, f.y);
    const first = !owned.bosses.has(worldDef.id);
    owned.bosses.add(worldDef.id);
    toast(def.name + ' DEFEATED', 3.5, '#9dff7a');
    if (first && owned.bosses.size === WORLDS.length) {
      toast('THE SOLAR SYSTEM IS YOURS', 5, '#ffd75a');
      earn(1000, rocket.x, rocket.y - 40 * RS);
    }
    saveGame();
  }

  function drawBossBar() {
    if (!boss) return;
    const def = boss.def, bw = Math.min(180, W - 40), bx = Math.round((W - bw) / 2), by = H - 12;
    drawText(def.name, Math.round((W - textWidth(def.name)) / 2), by - 8, boss.raged ? '#ff6b5b' : '#ffd75a');
    ctx.fillStyle = '#05060f'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
    ctx.fillStyle = '#3a1420'; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = boss.hitT > 0 ? '#ffffff' : boss.raged ? '#ff6b5b' : '#ff9a2a';
    ctx.fillRect(bx, by, Math.round(bw * clamp(boss.hp / def.hp, 0, 1)), 4);
  }

  // ================================================================ easter eggs
  // NUKE / click Earth 5x: missile, Earth explodes, restored from backup.
  // UFO: summon a saucer.  MOO / triple-click the ground: a cow jumps over Earth.
  // BSOD: Earth blue-screens.  Konami code: 30 s of turbo with rainbow exhaust.
  let missile = null;
  const cows = [];

  const MISSILE = ['..r..', '.rrr.', '.www.', '.www.', '.wkw.', '.www.', '.www.', 'rwwwr', 'r.w.r'];
  const COW = [
    '...........h.h', '.kwwwkkwwwwwww', 'k.wwkkkwwwwwkw', '..wwwkwwwkkwww', '..wwwwwwwkkwpp',
    '..wwwwwwwwww..', '..wwwpwwwww...', '..k.k....k.k..', '..k.k....k.k..'
  ];
  const PIXCOL = { r: '#e64545', w: '#f4f1ea', k: '#1d1b1f', p: '#f2a3b5', h: '#e8dcb4' };
  function pixelCanvas(rows) {
    const cv = makeCanvas(rows[0].length, rows.length), g = cv.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PIXCOL[ch]) { g.fillStyle = PIXCOL[ch]; g.fillRect(x, y, 1, 1); } }));
    return cv;
  }
  const missileCanvas = pixelCanvas(MISSILE);
  const cowCanvas = pixelCanvas(COW);

  function launchNuke() {
    if (!earthVisible() || missile) return;
    let sx, sy;
    if (visibleRocket() && rocket.mode !== 'abducted') { const n = noseWorld(); sx = sxOf(n.x); sy = syOf(n.y); }
    else { sx = W * 0.5; sy = syOf(groundY(cam.x + W * 0.5)) - 2; }
    missile = { x0: sx, y0: sy, t: 0, dur: 2.6, x: sx, y: sy, ang: 0, sc: 1 };
    toast('NUCLEAR LAUNCH DETECTED', 2.4, '#ff6b5b');
  }

  function updateMissile(dt) {
    if (!missile) return;
    const m = missile;
    m.t += dt;
    const u = clamp(m.t / m.dur, 0, 1);
    const ex = earth.x, ey = earthScreenY();
    const cx = m.x0, cy = Math.min(m.y0, ey) - H * 0.35;
    const bx = (1 - u) * (1 - u) * m.x0 + 2 * u * (1 - u) * cx + u * u * ex;
    const by = (1 - u) * (1 - u) * m.y0 + 2 * u * (1 - u) * cy + u * u * ey;
    m.ang = Math.atan2(bx - m.x, -(by - m.y)) || m.ang;
    m.x = bx; m.y = by; m.sc = lerp(1, 0.35, u);
    if (Math.random() < dt * 50) {
      spawn({ kind: 'dust', x: m.x + cam.x, y: m.y + cam.y, vx: rand(-4, 4), vy: rand(-4, 4), g: 0, drag: 0.97,
        life: rand(0.8, 1.6), age: 0, s0: 1, s1: m.sc * 3 + 1, col: '#cfcbd6', noGround: true, hit: true });
    }
    if (u >= 1) { missile = null; nukeBoom(); }
  }

  function drawMissile() {
    if (!missile) return;
    const m = missile;
    ctx.save();
    ctx.translate(Math.round(m.x), Math.round(m.y));
    ctx.rotate(m.ang);
    ctx.scale(m.sc * Math.max(1, Math.round(S)), m.sc * Math.max(1, Math.round(S)));
    ctx.drawImage(missileCanvas, -2, -4);
    ctx.fillStyle = Math.random() < 0.5 ? '#ffd75a' : '#ff8a2a';
    ctx.fillRect(-1, 5, 2, 2 + Math.round(Math.random() * 2));
    ctx.restore();
  }

  function nukeBoom() {
    const e = earth, R = e.R;
    e.state = 'boom'; e.t = 0; e.fromNuke = true;
    e.shards = [];
    const bs = Math.max(2, Math.round(R / 3.2));
    for (let by = 2; by < e.size - 2; by += bs) {
      for (let bx = 2; bx < e.size - 2; bx += bs) {
        const ox = bx + bs / 2 - e.c, oy = by + bs / 2 - e.c;
        const d = Math.hypot(ox, oy);
        if (d > R) continue;
        const sp = R * rand(0.6, 2.2), dd = d || 1;
        e.shards.push({ sx: bx, sy: by, bs, ox, oy, vx: ox / dd * sp + rand(-1, 1) * R * 0.3, vy: oy / dd * sp + rand(-1, 1) * R * 0.3, a: 0, spin: rand(-3, 3) });
      }
    }
    const wx = earth.x + cam.x, wy = earthScreenY() + cam.y;
    for (let i = 0; i < 60; i++) {
      const ang = Math.random() * TAU, sp = rand(0.1, 0.5) * H;
      spawn({ kind: 'spark', front: false, x: wx, y: wy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0, drag: 0.95,
        life: rand(0.6, 1.6), age: 0, s0: 2, s1: 1, hit: true, noGround: true });
    }
    flash = 1.6; shake = 1.2;
    toast(earth.name + '.EXE HAS STOPPED RESPONDING', 4, '#ff6b5b');
  }

  function bsodEarth() {
    if (!earthVisible()) return;
    earth.state = 'bsod'; earth.t = 0;
    toast(earth.name + ' RAN INTO A PROBLEM AND NEEDS TO RESTART', 4, '#9fd0ff');
  }

  function konami() {
    turboT = 30;
    toast('TURBO MODE: 30 SECONDS', 2.5, '#ff9cf0');
  }

  function spawnCow(wx) {
    const sx0 = sxOf(wx), sy0 = syOf(groundY(wx)) - 5;
    const dir = sx0 < earth.x ? 1 : -1;
    cows.push({ sx0, sy0, dir, t: 0, dur: 3.6, ex: earth.x + dir * earth.R * 3, ey: earthScreenY() + earth.R * 0.4 });
    toast('MOO!', 1.8);
  }

  function updateCows(dt) {
    for (let i = cows.length - 1; i >= 0; i--) {
      cows[i].t += dt;
      if (cows[i].t > cows[i].dur) cows.splice(i, 1);
    }
  }

  function drawCows() {
    for (const c of cows) {
      const u = clamp(c.t / c.dur, 0, 1);
      const ey = earthScreenY();
      const P1x = earth.x - c.dir * earth.R * 0.5, P1y = ey - earth.R * 6 - H * 0.15;
      const x = (1 - u) * (1 - u) * c.sx0 + 2 * u * (1 - u) * P1x + u * u * c.ex;
      const y = (1 - u) * (1 - u) * c.sy0 + 2 * u * (1 - u) * P1y + u * u * c.ey;
      const sc = lerp(Math.max(1, Math.round(S)), 0.5, u);
      ctx.save();
      ctx.globalAlpha = u > 0.85 ? (1 - u) / 0.15 : 1;
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(u * TAU * c.dir);
      ctx.scale(sc * c.dir, sc);
      ctx.drawImage(cowCanvas, -7, -5);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  let codeBuf = '';
  const ARROW_TOKEN = { ArrowUp: '^', ArrowDown: 'v', ArrowLeft: '<', ArrowRight: '>' };
  function eggKey(e) {
    if (!cfg.eggs) return;
    let t = ARROW_TOKEN[e.code];
    if (!t && e.key && e.key.length === 1) t = e.key.toUpperCase();
    if (!t) return;
    codeBuf = (codeBuf + t).slice(-12);
    const hit = code => { if (codeBuf.endsWith(code)) { codeBuf = ''; noteInteract(); return true; } return false; };
    if (hit('^^vv<><>BA')) konami();
    else if (hit('NUKE')) launchNuke();
    else if (hit('UFO')) { if (!ufo) { spawnUfo(); toast('WE COME IN PEACE', 2, '#b6ff9f'); } }
    else if (hit('MOO')) spawnCow(cam.x + W * rand(0.2, 0.5));
    else if (hit('BSOD')) bsodEarth();
    else if (hit('BEEP')) { if (visibleRocket()) { takeControl(); spawnSputniks(4); } }
  }

  const groundClicks = [];
  function earthClick() {
    const now = time;
    earth.clicks = earth.clicks.filter(t => now - t < 3);
    earth.clicks.push(now);
    sparkleBurst(earth.x + cam.x, earthScreenY() + cam.y, 10, H * 0.08);
    if (!cfg.eggs) return;
    const n = earth.clicks.length;
    if (n === 3) toast('PLEASE STOP POKING ' + earth.name, 1.6);
    else if (n === 4) toast('LAST WARNING', 1.4, '#ff9b6b');
    else if (n >= 5) { earth.clicks = []; launchNuke(); }
  }

  // ================================================================ credits & upgrades
  const UPGRADES = [
    { id: 'engine', name: 'ENGINE', desc: 'MORE THRUST', max: 5, base: 40 },
    { id: 'gyro', name: 'GYRO', desc: 'DAMPS SPIN WHEN YOU LET GO OF THE ARROWS', max: 3, base: 60 },
    { id: 'legs', name: 'LANDING LEGS', desc: 'SURVIVE HARDER LANDINGS AND HITS', max: 4, base: 50 },
    { id: 'laser', name: 'LASER', desc: 'FASTER FIRE, THEN DOUBLE AND TRIPLE SHOT', max: 5, base: 50 },
    { id: 'shield', name: 'SHIELD', desc: 'EACH LEVEL BLOCKS ONE HIT, RECHARGES', max: 3, base: 120 },
    { id: 'magnet', name: 'STAR MAGNET', desc: 'CATCH SHOOTING STARS FROM FURTHER AWAY', max: 3, base: 70 },
    { id: 'rainbow', name: 'RAINBOW EXHAUST', desc: 'COSMETIC. CLICK AGAIN TO TURN ON/OFF', max: 1, base: 300 }
  ];
  const up = { engine: 0, gyro: 0, legs: 0, laser: 0, shield: 0, magnet: 0, rainbow: 0 };
  let credits = 0, rainbowOn = true;

  // Ship types: multipliers on thrust, turning, crash tolerance and weapon cooling.
  const SHIPS = [
    { id: 'classic', name: 'CLASSIC', desc: 'THE ORIGINAL. BALANCED ALL-ROUNDER', cost: 0, thrust: 1, turn: 1, hull: 1, cool: 1, shield: 0 },
    { id: 'dart', name: 'DART', desc: 'MORE THRUST, TURNS FAST. FRAGILE', cost: 200, thrust: 1.25, turn: 1.35, hull: 0.75, cool: 1, shield: 0 },
    { id: 'hauler', name: 'HAULER', desc: 'TOUGH HULL AND +1 SHIELD. SLUGGISH', cost: 250, thrust: 0.88, turn: 0.75, hull: 1.5, cool: 1, shield: 1 },
    { id: 'gunship', name: 'GUNSHIP', desc: 'TWIN CANNONS THAT COOL MUCH FASTER', cost: 350, thrust: 1, turn: 0.9, hull: 1, cool: 1.6, shield: 0 }
  ];
  let shipDef = SHIPS[0];
  const owned = { weapons: new Set(['laser']), ships: new Set(['classic']), worlds: new Set(['moon']), bosses: new Set() };

  function setWorld(id) {
    const wl = WORLDS.find(v => v.id === id);
    if (!wl) return;
    owned.worlds.add(id);
    if (wl !== worldDef) {
      worldDef = wl;
      needsRebuild = true;
      menuOpen = false;
      toast('WELCOME TO ' + (wl.id === "moon" ? "THE MOON" : wl.name), 2.5, '#9fd0ff');
    }
    saveGame();
  }

  // The cheats tab stays hidden until Ctrl+Alt+Shift+G; pressing it again hides it and switches cheats off.
  let cheatsUnlocked = false;
  function toggleCheatsUnlock() {
    if (!cfg.cheats) return;
    cheatsUnlocked = !cheatsUnlocked;
    if (!cheatsUnlocked) for (const k in cheat) cheat[k] = false;
    toast(cheatsUnlocked ? 'CHEATS UNLOCKED' : 'CHEATS HIDDEN', 2.5, '#ff9cf0');
    noteInteract();
    saveGame();
  }
  const maxShield = () => up.shield + shipDef.shield;

  function setWeapon(id) {
    const w = WEAPONS.find(v => v.id === id);
    if (!w) return;
    owned.weapons.add(id);
    weaponDef = w;
    saveGame();
  }
  function setShip(id) {
    const sh = SHIPS.find(v => v.id === id);
    if (!sh) return;
    owned.ships.add(id);
    shipDef = sh;
    needsShip = true;
    shield.charges = Math.min(shield.charges, maxShield());
    saveGame();
  }
  function cycleWeapon() {
    const have = WEAPONS.filter(w => owned.weapons.has(w.id));
    noteInteract();
    if (have.length < 2) { toast('BUY MORE WEAPONS IN THE HANGAR (TAB)', 2); return; }
    setWeapon(have[(have.indexOf(weaponDef) + 1) % have.length].id);
    toast(weaponDef.name, 1, '#7ff0ff');
  }

  // Cheats (not saved, except what they unlock)
  const cheat = { god: false, noHeat: false, lowGrav: false };
  const cheating = () => cheat.god || cheat.noHeat || cheat.lowGrav;
  function clearEnemies() {
    asteroids.length = 0; sputniks.length = 0; foes.length = 0; plasma.length = 0; wave = null; foeWave = null;
    boss = null; bossDelay = 0;
    if (ufo && rocket.mode !== 'abducted' && rocket.mode !== 'taken') ufo = null;
  }
  const CHEATS = [
    { name: 'ADD $1000', desc: 'FREE MONEY', run: () => { credits += 1000; } },
    { name: 'GOD MODE', desc: 'NOTHING CAN DESTROY THE SHIP', flag: 'god' },
    { name: 'NO OVERHEAT', desc: 'THE WEAPON NEVER HEATS UP', flag: 'noHeat' },
    { name: 'LOW GRAVITY', desc: 'FLOATY FLIGHT', flag: 'lowGrav' },
    { name: 'UNLOCK EVERYTHING', desc: 'ALL WEAPONS, SHIPS AND WORLDS, FREE',
      run: () => {
        for (const w of WEAPONS) owned.weapons.add(w.id);
        for (const sh of SHIPS) owned.ships.add(sh.id);
        for (const wl of WORLDS) owned.worlds.add(wl.id);
      } },
    { name: 'MAX ALL UPGRADES', desc: 'EVERY UPGRADE TO ITS TOP LEVEL',
      run: () => { for (const u of UPGRADES) up[u.id] = u.max; shield.charges = maxShield(); rainbowOn = true; } },
    { name: 'TURBO BOOST', desc: '30 SECONDS OF TURBO', run: () => konami() },
    { name: 'CLEAR ENEMIES', desc: 'REMOVES ROCKS, ENEMIES, BOSSES AND UFOS', run: clearEnemies },
    { name: 'SUMMON BOSS', desc: "CALLS THIS WORLD'S BOSS RIGHT NOW", run: () => { menuOpen = false; rocket.mode === 'manual' ? spawnBoss() : toast('FLY THE SHIP FIRST', 2); } }
  ];
  function runCheat(c) {
    if (c.flag) {
      cheat[c.flag] = !cheat[c.flag];
      if (cheat.noHeat) { heat = 0; overheated = false; }
      menuFlash(c.name + (cheat[c.flag] ? ' ON' : ' OFF'));
    } else { c.run(); saveGame(); menuFlash(c.name + ': DONE'); }
  }
  const shield = { charges: 0, regenT: 0, flashT: 0, graceT: 0 };
  const floaters = [];
  const SAVE_KEY = 'moonLander.save.v1';
  const upgradeCost = u => Math.round(u.base * Math.pow(1.7, up[u.id]));

  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) return;
      credits = Math.max(0, s.credits | 0);
      for (const k in up) up[k] = clamp((s.up && s.up[k]) | 0, 0, 9);
      if (s.score) for (const k in score) score[k] = s.score[k] | 0;
      rainbowOn = s.rainbowOn !== false;
      for (const id of s.weapons || []) if (WEAPONS.some(w => w.id === id)) owned.weapons.add(id);
      for (const id of s.ships || []) if (SHIPS.some(sh => sh.id === id)) owned.ships.add(id);
      if (owned.weapons.has(s.weapon)) weaponDef = WEAPONS.find(w => w.id === s.weapon);
      if (owned.ships.has(s.ship)) { shipDef = SHIPS.find(sh => sh.id === s.ship); needsShip = true; }
      for (const id of s.worlds || []) if (WORLDS.some(wl => wl.id === id)) owned.worlds.add(id);
      if (owned.worlds.has(s.world)) { worldDef = WORLDS.find(wl => wl.id === s.world); needsRebuild = true; }
      cheatsUnlocked = !!s.cheatsUnlocked;
      for (const id of s.bosses || []) if (BOSSES[id]) owned.bosses.add(id);
    } catch (e) { /* storage unavailable: start fresh */ }
    shield.charges = maxShield();
  }
  function saveGame() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({
        credits, up, score, rainbowOn,
        weapons: [...owned.weapons], ships: [...owned.ships], weapon: weaponDef.id, ship: shipDef.id,
        worlds: [...owned.worlds], world: worldDef.id, cheatsUnlocked, bosses: [...owned.bosses]
      })); } catch (e) { /* ignore */ }
  }
  function resetProgress() {
    credits = 0;
    for (const k in up) up[k] = 0;
    for (const k in score) score[k] = 0;
    owned.weapons = new Set(['laser']); owned.ships = new Set(['classic']); owned.worlds = new Set(['moon']); owned.bosses = new Set();
    bossMeter = 0; bossDelay = 0; if (boss) boss.state = 'leave';
    weaponDef = WEAPONS[0]; shipDef = SHIPS[0]; needsShip = true;
    if (worldDef !== WORLDS[0]) { worldDef = WORLDS[0]; needsRebuild = true; }
    cheatsUnlocked = false;
    for (const k in cheat) cheat[k] = false;
    heat = 0; overheated = false;
    shield.charges = 0;
    saveGame();
    toast('PROGRESS RESET', 2);
  }

  function earn(amount, wx, wy) {
    credits = Math.max(0, credits + amount);
    floaters.push({ x: wx, y: wy, t: 0, text: (amount >= 0 ? '+$' : '-$') + Math.abs(amount), col: amount >= 0 ? '#ffd75a' : '#ff6b5b' });
    saveGame();
  }

  function shieldAbsorb() {
    if (shield.graceT > 0) return true;          // still covered by the last hit's grace period
    if (shield.charges <= 0) return false;
    shield.charges--;
    shield.regenT = 0;
    shield.flashT = 0.5;
    shield.graceT = 1;
    sparkleBurst(rocket.x, rocket.y, 16, H * 0.15);
    return true;
  }

  function updateEconomy(dt) {
    if (shield.charges < maxShield()) {
      shield.regenT += dt;
      if (shield.regenT > 12) { shield.charges++; shield.regenT = 0; }
    }
    if (shield.flashT > 0) shield.flashT -= dt;
    if (shield.graceT > 0) shield.graceT -= dt;
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt; f.y -= H * 0.06 * dt;
      if (f.t > 1.3) floaters.splice(i, 1);
    }
  }

  function drawShield() {
    if (shield.charges <= 0 && shield.flashT <= 0) return;
    if (!visibleRocket() || rocket.mode === 'abducted') return;
    const cx = sxOf(rocket.x), cy = syOf(rocket.y), r = 37 * RS;
    const n = Math.round(r * 2.2);
    ctx.fillStyle = '#7ff0ff';
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + time * 0.8;
      if ((k + Math.floor(time * 8)) % 3 === 0) continue;
      ctx.globalAlpha = shield.flashT > 0 ? 0.9 : 0.18 + 0.06 * shield.charges;
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    for (const f of floaters) {
      ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
      drawText(f.text, Math.round(sxOf(f.x) - textWidth(f.text) / 2), Math.round(syOf(f.y)), f.col);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- hangar menu (upgrades, weapons, ships, cheats)
  let menuOpen = false, menuHover = -1, menuMsg = '', menuMsgT = 0, menuTab = 0, resetArmT = -1e9;
  const MENU_MAX_ROWS = 11;                         // number keys 1-9 and 0 pick the first ten rows
  const menuTabs = () => cfg.cheats && cheatsUnlocked ? ['UPGRADES', 'WEAPONS', 'SHIPS', 'WORLDS', 'CHEATS'] : ['UPGRADES', 'WEAPONS', 'SHIPS', 'WORLDS'];

  function menuFlash(msg) { menuMsg = msg; menuMsgT = 2; }

  function buyUpgrade(u) {
    if (u.id === 'rainbow' && up.rainbow) { rainbowOn = !rainbowOn; saveGame(); menuFlash('RAINBOW EXHAUST ' + (rainbowOn ? 'ON' : 'OFF')); return; }
    if (up[u.id] >= u.max) { menuFlash('ALREADY MAXED OUT'); return; }
    const c = upgradeCost(u);
    if (credits < c) { menuFlash('NOT ENOUGH CREDITS'); return; }
    credits -= c;
    up[u.id]++;
    if (u.id === 'shield') shield.charges = maxShield();
    if (u.id === 'rainbow') rainbowOn = true;
    saveGame();
    menuFlash(u.name + ' UPGRADED');
  }

  // A weapon or ship: buy it once, then click to equip.
  function shopRow(item, set, current, equip, curLabel = 'EQUIPPED') {
    const has = set.has(item.id), cur = item === current;
    return {
      name: item.name, desc: item.desc,
      right: cur ? curLabel : has ? 'OWNED' : '$' + item.cost,
      col: cur ? '#9dff7a' : has ? '#a9b4d6' : credits >= item.cost ? '#ffd75a' : '#7a6a4a',
      act() {
        if (!has) {
          if (credits < item.cost) { menuFlash('NOT ENOUGH CREDITS'); return; }
          credits -= item.cost;
        }
        equip(item.id);
        menuFlash(item.name + (curLabel === 'HERE' ? ': ARRIVED' : ' EQUIPPED'));
      }
    };
  }

  // Rows of the current tab: { name, desc, right, col, pips?, act }. The last row closes the menu.
  function menuRows() {
    const tabs = menuTabs();
    menuTab = clamp(menuTab, 0, tabs.length - 1);
    const tab = tabs[menuTab], toggle = v => ({ right: v ? 'ON' : 'OFF', col: v ? '#9dff7a' : '#ffb36b' });
    let rows;
    if (tab === 'UPGRADES') {
      rows = UPGRADES.map(u => {
        const lv = up[u.id], c = upgradeCost(u);
        const lab = u.id === 'rainbow' && lv ? { right: rainbowOn ? 'ON' : 'OFF', col: rainbowOn ? '#9dff7a' : '#8a93b0' }
          : lv >= u.max ? { right: 'MAX', col: '#8a93b0' }
          : { right: '$' + c, col: credits >= c ? '#ffd75a' : '#7a6a4a' };
        return { name: u.name, desc: u.desc, pips: [lv, u.max], ...lab, act: () => buyUpgrade(u) };
      });
      rows.push({ name: 'AUTOPILOT', desc: 'FLIES THE SHIP HOME AFTER ' + cfg.idleReturn + ' S IDLE. H TOGGLES',
        ...toggle(cfg.autopilot), act: () => toggleAutopilot() });
      const armed = time - resetArmT < 4;
      rows.push({ name: 'RESET PROGRESS', desc: 'WIPES CREDITS, UPGRADES, WEAPONS, SHIPS, WORLDS AND SCORE',
        right: armed ? 'SURE? PRESS AGAIN' : '', col: '#ff6b5b',
        act: () => {
          if (!armed) { resetArmT = time; menuFlash('PRESS AGAIN TO WIPE EVERYTHING'); return; }
          resetArmT = -1e9; resetProgress(); menuFlash('PROGRESS RESET');
        } });
    } else if (tab === 'WEAPONS') rows = WEAPONS.map(w => shopRow(w, owned.weapons, weaponDef, setWeapon));
    else if (tab === 'SHIPS') rows = SHIPS.map(sh => shopRow(sh, owned.ships, shipDef, setShip));
    else if (tab === 'WORLDS') rows = WORLDS.map(wl => ({ ...shopRow(wl, owned.worlds, worldDef, setWorld, 'HERE'),
      pips: [owned.bosses.has(wl.id) ? 1 : 0, 1], desc: wl.desc + (owned.bosses.has(wl.id) ? ' - BOSS BEATEN' : '') }));
    else rows = CHEATS.map(c => ({ name: c.name, desc: c.desc, ...(c.flag ? toggle(cheat[c.flag]) : { right: '', col: '' }), act: () => runCheat(c) }));
    rows.push({ name: 'CLOSE  (TAB / ESC)', close: true, desc: '', right: '', col: '', act: () => { menuOpen = false; } });
    return rows;
  }

  function menuLayout() {
    const w = Math.min(260, W - 8), rowH = 11;
    const h = 40 + MENU_MAX_ROWS * rowH + 16;
    const y = Math.max(2, Math.round((H - h) / 2));
    return { x: Math.round((W - w) / 2), y, w, h, rowH, tabY: y + 24, top: y + 38 };
  }

  function menuRowAt(sx, sy) {
    const L = menuLayout();
    if (sx < L.x || sx > L.x + L.w || sy < L.top) return -1;
    const i = Math.floor((sy - L.top) / L.rowH);
    return i < menuRows().length ? i : -1;
  }

  // x positions of the tab labels: [{ x, w }]
  function menuTabRects() {
    const L = menuLayout();
    let x = L.x + 8;
    return menuTabs().map(t => { const r = { x, w: textWidth(t) }; x += r.w + 10; return r; });
  }
  function menuTabAt(sx, sy) {
    const L = menuLayout();
    if (sy < L.tabY - 4 || sy > L.tabY + 9) return -1;
    return menuTabRects().findIndex(r => sx >= r.x - 4 && sx <= r.x + r.w + 4);
  }
  function menuSetTab(i) {
    const n = menuTabs().length;
    menuTab = mod(i, n);
    menuHover = -1; menuMsgT = 0; resetArmT = -1e9;
  }

  function menuActivate(i) {
    const row = menuRows()[i];
    if (row) row.act();
  }

  function toggleMenu(open) {
    menuOpen = open ?? !menuOpen;
    menuHover = -1; resetArmT = -1e9;
    for (const k in keys) keys[k] = false;
    noteInteract();
  }

  function drawMenu(dt) {
    if (menuMsgT > 0) menuMsgT -= dt;
    const L = menuLayout(), rows = menuRows(), tabs = menuTabs();
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.94; ctx.fillStyle = '#080b17'; ctx.fillRect(L.x, L.y, L.w, L.h);
    ctx.globalAlpha = 1; ctx.fillStyle = '#3b4a7a';
    ctx.fillRect(L.x, L.y, L.w, 1); ctx.fillRect(L.x, L.y + L.h - 1, L.w, 1);
    ctx.fillRect(L.x, L.y, 1, L.h); ctx.fillRect(L.x + L.w - 1, L.y, 1, L.h);

    drawText('HANGAR', L.x + 8, L.y + 8, '#ffe8a8', 2);
    const cr = 'CREDITS $' + credits;
    drawText(cr, L.x + L.w - 8 - textWidth(cr), L.y + 12, '#ffd75a');

    menuTabRects().forEach((r, i) => {
      const on = i === menuTab;
      drawText(tabs[i], r.x, L.tabY, on ? '#ffe8a8' : tabs[i] === 'CHEATS' ? '#a06c9a' : '#6f7aa3');
      if (on) { ctx.fillStyle = '#ffe8a8'; ctx.fillRect(r.x, L.tabY + 7, r.w, 1); }
    });
    ctx.fillStyle = '#232c4d'; ctx.fillRect(L.x + 4, L.tabY + 10, L.w - 8, 1);

    const right = L.x + L.w - 8, pipX = L.x + Math.round(L.w * 0.5);
    rows.forEach((row, i) => {
      const y = L.top + i * L.rowH;
      if (i === menuHover) { ctx.fillStyle = '#1c2442'; ctx.fillRect(L.x + 2, y - 2, L.w - 4, L.rowH - 1); }
      drawText(row.close ? row.name : (i + 1) % 10 + ' ' + row.name, L.x + 8, y, row.close ? '#a9b4d6' : '#e8ecff');
      if (row.pips) {
        for (let l = 0; l < row.pips[1]; l++) {
          ctx.fillStyle = l < row.pips[0] ? '#7ff0ff' : '#2b3550';
          ctx.fillRect(pipX + l * 6, y + 1, 4, 3);
        }
      }
      if (row.right) drawText(row.right, right - textWidth(row.right), y, row.col);
    });
    const hover = rows[menuHover];
    const foot = menuMsgT > 0 ? menuMsg
      : hover && hover.desc ? hover.desc
      : menuTab === 0 ? 'EARN CREDITS: STARS, ROCKS, UFOS, LANDINGS'
      : 'LEFT / RIGHT SWITCH TABS. R SWAPS WEAPON IN FLIGHT';
    drawText(foot, L.x + 8, L.y + L.h - 11, menuMsgT > 0 ? '#ffe8a8' : '#a9b4d6');
  }

  // HUD button that opens the menu (top-right)
  function menuButtonRect() {
    const label = '[TAB] HANGAR  $' + credits;
    const w = textWidth(label) + 6;
    return { x: W - w - 4, y: 4, w, h: 9, label };
  }

  // ================================================================ HUD & toasts (3x5 pixel font)
  const FONT = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'], D: ['##.', '#.#', '#.#', '#.#', '##.'],
    E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'],
    O: ['.#.', '#.#', '#.#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'],
    Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['##.', '..#', '.#.', '#..', '###'], 3: ['##.', '..#', '.#.', '..#', '##.'],
    4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
    ':': ['...', '.#.', '...', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
    '/': ['..#', '..#', '.#.', '#..', '#..'], '.': ['...', '...', '...', '...', '.#.'],
    ',': ['...', '...', '...', '.#.', '#..'], '!': ['.#.', '.#.', '.#.', '...', '.#.'],
    '?': ['##.', '..#', '.#.', '...', '.#.'], "'": ['.#.', '.#.', '...', '...', '...'],
    '(': ['.#.', '#..', '#..', '#..', '.#.'], ')': ['.#.', '..#', '..#', '..#', '.#.'],
    '$': ['.##', '##.', '.#.', '.##', '##.'], '+': ['...', '.#.', '###', '.#.', '...'],
    '[': ['##.', '#..', '#..', '#..', '##.'], ']': ['.##', '..#', '..#', '..#', '.##']
  };
  const textWidth = (s, sc = 1) => (s.length * 4 - 1) * sc;

  function drawText(str, x, y, col, sc = 1) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = FONT[ch];
      if (g) {
        for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
          if (g[r][c] !== '#') continue;
          ctx.fillStyle = '#05060f';
          ctx.fillRect(cx + (c + 1) * sc, y + (r + 1) * sc, sc, sc);
          ctx.fillStyle = col;
          ctx.fillRect(cx + c * sc, y + r * sc, sc, sc);
        }
      }
      cx += 4 * sc;
    }
  }

  const toasts = [];
  function toast(text, dur = 2.6, col = '#ffe8a8') {
    toasts.push({ text, t: 0, dur, col });
    if (toasts.length > 3) toasts.shift();
  }

  function drawHud(dt) {
    const playing = rocket.mode !== 'auto';
    const target = cfg.showHud && (playing || time - lastInteract < 4) ? 1 : 0;
    hudAlpha += (target - hudAlpha) * Math.min(1, dt * (target ? 6 : 1.2));
    if (hintT > 0) hintT -= dt;

    if (hudAlpha > 0.02) {
      ctx.globalAlpha = hudAlpha;
      drawText('STARS ' + score.stars + '  ROCKS ' + score.rocks + '  UFOS ' + score.ufos + '  SPUTNIKS ' + score.sputniks + '  ALIENS ' + score.aliens + '  LANDINGS ' + score.landings, 6, 6, '#e8ecff');
      let y = 14;
      if (rocket.mode === 'return') { drawText('AUTOPILOT FLYING HOME', 6, y, '#7ff0ff'); y += 8; }
      else { drawText('AUTOPILOT ' + (cfg.autopilot ? 'ON' : 'OFF'), 6, y, cfg.autopilot ? '#5f7fa8' : '#ffb36b'); y += 8; }
      if (turboT > 0) { drawText('TURBO ' + Math.ceil(turboT), 6, y, '#ff9cf0'); y += 8; }
      if (maxShield()) { drawText('SHIELD ' + shield.charges + '/' + maxShield(), 6, y, '#7ff0ff'); y += 8; }
      if (playing) {
        // weapon name + heat gauge
        const wl = weaponDef.name, bx = 6 + textWidth(wl) + 5, bw = 40;
        drawText(wl, 6, y, overheated ? '#ff6b5b' : '#a9b4d6');
        ctx.fillStyle = '#05060f'; ctx.fillRect(bx - 1, y - 1, bw + 2, 7);
        ctx.fillStyle = '#2b3550'; ctx.fillRect(bx, y, bw, 5);
        ctx.fillStyle = overheated ? (Math.floor(time * 8) % 2 ? '#ff6b5b' : '#ffd75a') : heat > 0.7 ? '#ffb36b' : '#7ff0ff';
        ctx.fillRect(bx, y, Math.round(bw * heat), 5);
        if (overheated) drawText('OVERHEAT', bx + bw + 5, y, '#ff6b5b');
        y += 8;
      }
      if (playing && cfg.bosses && !boss) { drawText(bossDelay > 0 ? 'BOSS INCOMING' : 'BOSS ' + bossMeter + '/' + BOSS_AT, 6, y, bossDelay > 0 ? '#ff6b5b' : '#8a93b0'); y += 8; }
      if (cheating()) drawText('CHEATS ON', 6, y, '#ff9cf0');
      drawBossBar();
      const b = menuButtonRect();
      ctx.fillStyle = '#0d1430'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#3b4a7a'; ctx.fillRect(b.x, b.y + b.h, b.w, 1);
      drawText(b.label, b.x + 3, b.y + 2, '#ffd75a');
      if (CEIL > 0 && cam.y < -H * 0.2) {
        const alt = 'ALT ' + Math.round(-(rocket.y - H * 0.82) / S);
        drawText(alt, W - textWidth(alt) - 6, 16, '#a9b4d6');
      }
      if (hintT > 0) {
        ctx.globalAlpha = hudAlpha * clamp(hintT, 0, 1);
        const lines = cfg.keyboardControl
          ? ['UP: THRUST   LEFT/RIGHT: ROTATE   DOWN: STOP SPIN', 'Q / E: SIDE THRUSTERS   SPACE: FIRE   R: WEAPON', 'H: AUTOPILOT   TAB: HANGAR']
          : ['DRAG THE ROCKET - CLICK ROCKS AND STARS'];
        lines.forEach((l, i) => drawText(l, Math.round((W - textWidth(l)) / 2), 28 + i * 8, '#ffe8a8'));
      }
      ctx.globalAlpha = 1;
    }

    // toasts & egg overlays are always shown
    for (let i = toasts.length - 1; i >= 0; i--) {
      toasts[i].t += dt;
      if (toasts[i].t > toasts[i].dur) toasts.splice(i, 1);
    }
    toasts.forEach((t, i) => {
      const sc = textWidth(t.text, 2) <= W - 12 ? 2 : 1;
      ctx.globalAlpha = clamp(Math.min(t.t * 6, (t.dur - t.t) * 2), 0, 1);
      drawText(t.text, Math.round((W - textWidth(t.text, sc)) / 2), Math.round(H * 0.3) + i * 14, t.col, sc);
    });
    ctx.globalAlpha = 1;

    if (earth && earth.state === 'restore') {
      const label = 'RESTORING ' + earth.name + ' FROM BACKUP...';
      const bw = 120, bx = Math.round((W - bw) / 2), by = Math.round(H * 0.45);
      drawText(label, Math.round((W - textWidth(label)) / 2), by - 9, '#9fd0ff');
      ctx.fillStyle = '#05060f'; ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
      ctx.fillStyle = '#2b3b66'; ctx.fillRect(bx, by, bw, 5);
      ctx.fillStyle = '#9fd0ff'; ctx.fillRect(bx, by, Math.round(bw * clamp(earth.t / 3.3, 0, 1)), 5);
    }
  }

  // ================================================================ collisions
  function updateCollisions() {
    const active = rocket.mode === 'manual' || rocket.mode === 'drag';
    if (active) {
      // sputnik ramming
      const c = Math.cos(rocket.angle), sn = Math.sin(rocket.angle);
      for (let i = sputniks.length - 1; i >= 0; i--) {
        const s = sputniks[i];
        let hit = false;
        for (const ly of [-24, -8, 8, 24]) {
          const wx = rocket.x - ly * sn * RS, wy = rocket.y + ly * c * RS;
          if (Math.hypot(wd(wx - s.x), wy - s.y) < (ly > 10 ? 15 : 9) * RS + 3 * S) { hit = true; break; }
        }
        if (!hit) continue;
        const dx = wd(rocket.x - s.x), dy = rocket.y - s.y, d = Math.hypot(dx, dy) || 1;
        damageSputnik(i, -dx / d * H * 0.3, -dy / d * H * 0.3);
        if (sputniks[i] === s) { s.state = 'orbit'; s.diveT = rand(4, 7); s.vx = -dx / d * H * 0.3; s.vy = -dy / d * H * 0.3; }
        if (rocket.mode !== 'manual' || shieldAbsorb()) continue;
        if (cfg.crashes && Math.hypot(rocket.vx - s.vx, rocket.vy - s.vy) > H * 0.5) { explodeRocket(); return; }
        rocket.grounded = false;
        rocket.vx += dx / d * H * 0.2; rocket.vy += dy / d * H * 0.2;
        rocket.w += rand(-2, 2);
      }
    }
    if (active) {
      // natives: ramming hurts both sides (mines have their own fuse)
      for (let i = foes.length - 1; i >= 0; i--) {
        const f = foes[i];
        if (!f || f.a < 0.4 || f.def.ai === 'mine' || !hitRocketBody({ x: f.x, y: f.y, r: f.def.r * foeScale(f.def) })) continue;
        const dx = wd(rocket.x - f.x), dy = rocket.y - f.y, d = Math.hypot(dx, dy) || 1;
        const rel = Math.hypot(rocket.vx - f.vx, rocket.vy - f.vy);
        // a boss only takes ramming damage every so often, or sitting on it would shred it
        if (!f.def.boss || time - (f.ramT || -1e9) > 0.6) { f.ramT = time; damageFoe(i, -dx / d * H * 0.3, -dy / d * H * 0.3); }
        if (foes[i] === f && f.def.ai === 'diver') { f.sub = ''; f.st = 0; f.wait = rand(1.5, 2.5); }
        if (rocket.mode !== 'manual' || shieldAbsorb()) continue;
        if (cfg.crashes && rel > H * 0.5) { explodeRocket(); return; }
        rocket.grounded = false;
        rocket.vx += dx / d * H * 0.2; rocket.vy += dy / d * H * 0.2;
        rocket.w += rand(-2, 2);
      }
    }
    if (active) {
      for (let i = asteroids.length - 1; i >= 0; i--) {
        const a = asteroids[i];
        const dx = wd(rocket.x - a.x), dy = rocket.y - a.y, d = Math.hypot(dx, dy) || 1;
        if (d < a.r + 34 * RS && hitRocketBody(a)) {
          blastAsteroid(i, rocket.vx * 0.3, rocket.vy * 0.3);
          if (rocket.mode === 'manual' && !shieldAbsorb()) {
            rocket.grounded = false;
            rocket.vx += dx / d * H * 0.12 * (a.size + 1);
            rocket.vy += dy / d * H * 0.12 * (a.size + 1);
            rocket.w += rand(-1.5, 1.5) * (a.size + 1);
          }
        }
      }
    }
    if (active || rocket.mode === 'return') {
      const i = shootingHit(rocket.x, rocket.y, 16 * RS * (1 + 0.8 * up.magnet));
      if (i >= 0) catchShooting(i);
    }
  }

  function hitRocketBody(a) {
    const c = Math.cos(rocket.angle), s = Math.sin(rocket.angle);
    for (const ly of [-24, -10, 4, 18, 28]) {
      const wx = rocket.x - ly * s * RS, wy = rocket.y + ly * c * RS;
      if (Math.hypot(wd(wx - a.x), wy - a.y) < a.r + (ly > 10 ? 15 : 9) * RS) return true;
    }
    return false;
  }

  // ================================================================ camera
  function updateCamera(dt) {
    if (cfg.worldSize <= 1) { cam.x = 0; cam.y = 0; return; }
    const m = rocket.mode;
    if (m === 'dead' || m === 'taken') return;
    const inHome = Math.abs(wd(rocket.x - W / 2)) < W * 0.45 && rocket.y > H * 0.04;
    if (m === 'auto' && inHome) {
      const k = Math.min(1, dt * 1.6);
      cam.x += wd(-cam.x) * k;
      cam.y += -cam.y * k;
      if (Math.abs(wd(cam.x)) < 0.05 && Math.abs(cam.y) < 0.05) { cam.x -= wd(cam.x); cam.y = 0; }
      return;
    }
    const k = Math.min(1, dt * 5);
    const rsx = wd(rocket.x - cam.x - W / 2), dz = W * 0.2;
    if (rsx > dz) cam.x += (rsx - dz) * k; else if (rsx < -dz) cam.x += (rsx + dz) * k;
    const rsy = rocket.y - cam.y;
    let ey = 0;
    if (rsy < H * 0.3) ey = rsy - H * 0.3; else if (rsy > H * 0.62) ey = rsy - H * 0.62;
    cam.y = clamp(cam.y + ey * k, -CEIL, 0);
  }

  // ================================================================ input
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, msx: 0, msy: 0, wx: 0, wy: 0, has: false };

  function trackMouse(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    mouse.msx = e.clientX * DPR / PS;
    mouse.msy = e.clientY * DPR / PS;
    mouse.has = true;
    if (WW) { mouse.wx = wrapX(mouse.msx + cam.x); mouse.wy = mouse.msy + cam.y; }
  }

  // The wallpaper keeps plain mouse events (that's what Lively forwards); the game
  // uses pointer events so touch screens can drag the rocket too.
  const PTR = MODE === 'game'
    ? { move: 'pointermove', down: 'pointerdown', up: 'pointerup' }
    : { move: 'mousemove', down: 'mousedown', up: 'mouseup' };
  // Only clicks on the scene itself count (not on the game shell's buttons/panels).
  const onScene = e => e.target === canvas || e.target === document.body || e.target === document.documentElement;
  // Don't steer the ship while typing in / adjusting a page control.
  const inFormField = e => e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);

  window.addEventListener(PTR.move, e => {
    trackMouse(e);
    if (menuOpen) menuHover = menuRowAt(mouse.msx, mouse.msy);
  });

  window.addEventListener(PTR.down, e => {
    if (e.button !== 0 || !ground || !onScene(e)) return;
    trackMouse(e);
    const wx = mouse.wx, wy = mouse.wy;

    if (menuOpen) {
      const L = menuLayout();
      const inside = mouse.msx >= L.x && mouse.msx <= L.x + L.w && mouse.msy >= L.y && mouse.msy <= L.y + L.h;
      const tab = menuTabAt(mouse.msx, mouse.msy);
      if (!inside) toggleMenu(false);
      else if (tab >= 0) menuSetTab(tab);
      else menuActivate(menuRowAt(mouse.msx, mouse.msy));
      return;
    }
    if (cfg.showHud && hudAlpha > 0.3) {
      const b = menuButtonRect();
      if (mouse.msx >= b.x && mouse.msx <= b.x + b.w && mouse.msy >= b.y && mouse.msy <= b.y + b.h + 1) { toggleMenu(true); return; }
    }
    noteInteract();

    if (cfg.dragRocket && hitRocket(wx, wy)) { startDrag(wx, wy); return; }
    if (ufo && ufoHit(wx, wy, 3)) { damageUfo(); return; }
    for (let i = sputniks.length - 1; i >= 0; i--) {
      if (sputHit(sputniks[i], wx, wy, 4)) { damageSputnik(i); return; }
    }
    for (let i = foes.length - 1; i >= 0; i--) {
      if (foeHit(foes[i], wx, wy, 4)) { damageFoe(i); return; }
    }
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      if (Math.hypot(wd(wx - a.x), wy - a.y) < a.r + 3) { blastAsteroid(i, 0, 0); return; }
    }
    const si = shootingHit(wx, wy, 9);
    if (si >= 0) { catchShooting(si); return; }
    if (earthVisible() && Math.hypot(mouse.msx - earth.x, mouse.msy - earthScreenY()) < earth.R + 2) { earthClick(); return; }

    if (wy > groundY(wx) - 2) {
      if (cfg.flightMode === 1 && cfg.clickToFly && rocket.mode === 'auto') {
        const margin = 20 * RS + 2;
        rocket.landX = Math.round(wrapX(wx));
        if (Math.abs(wd(rocket.landX - W / 2)) > W / 2 - margin) rocket.landX = Math.round(clamp(wx, margin, W - margin));
        rocket.plan = [hoverPoint(rocket.landX)];
        if (rocket.state === 'landed') rocket.timer = 0;
        else if (rocket.state === 'descent') rocket.state = 'cruise';
      }
      kickDust(wx, 8, 0.35);
      const now = time;
      while (groundClicks.length && now - groundClicks[0].t > 0.9) groundClicks.shift();
      groundClicks.push({ t: now, x: wx });
      if (cfg.eggs && groundClicks.length >= 3 && groundClicks.every(g => Math.abs(wd(g.x - wx)) < 25)) {
        groundClicks.length = 0;
        spawnCow(wx);
      }
      return;
    }

    if (cfg.shootingStars) {
      spawnShootingStar(wx, wy, mouse.msx < W / 2 ? 1 : -1, rand(0.25, 0.55), rand(14, 26) * S, rand(0.6, 0.9));
    }
  });

  window.addEventListener(PTR.up, e => { trackMouse(e); endDrag(); });
  if (MODE === 'game') window.addEventListener('pointercancel', () => endDrag());
  window.addEventListener('blur', () => { endDrag(); for (const k in keys) keys[k] = false; });

  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', Space: 'fire',
    KeyQ: 'strafeL', KeyE: 'strafeR'
  };

  window.addEventListener('keydown', e => {
    if (inFormField(e)) return;
    if (e.code === 'KeyG' && e.ctrlKey && e.altKey && e.shiftKey) {       // secret: show/hide the cheats tab
      e.preventDefault();
      if (!e.repeat) toggleCheatsUnlock();
      return;
    }
    if (e.code === 'Tab' || e.code === 'KeyG') { e.preventDefault(); if (!e.repeat) toggleMenu(); return; }
    if (menuOpen) {
      e.preventDefault();
      if (e.code === 'Escape') toggleMenu(false);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') menuSetTab(menuTab - 1);
      if (e.code === 'ArrowRight' || e.code === 'KeyD') menuSetTab(menuTab + 1);
      const d = /^Digit([0-9])$/.exec(e.code);
      if (d && !e.repeat) menuActivate((Number(d[1]) + 9) % 10);
      return;
    }
    if (!e.repeat) eggKey(e);
    if (!cfg.keyboardControl) return;
    if (e.code === 'KeyH') {
      if (!e.repeat) toggleAutopilot();
      return;
    }
    if (e.code === 'KeyR') {
      if (!e.repeat) cycleWeapon();
      return;
    }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    keys[k] = true;
    if (k === 'fire') noteInteract(); else takeControl();
  });

  window.addEventListener('keyup', e => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });

  window.addEventListener('resize', () => { needsRebuild = true; });

  // ================================================================ main loop
  function twinklePhase(s) {
    if (cfg.flightMode !== 0) return time * s.tw + s.ph;
    const P = loopTimes().period;
    const k = Math.max(1, Math.round(s.tw * P / TAU));
    return (TAU * k * vClock()) / P + s.ph;
  }

  let lastDt = 1 / 60;

  function update(dt) {
    time += dt;
    lastDt = dt;
    const k = Math.min(1, dt * 2);
    mouse.sx += ((cfg.mouseParallax ? mouse.x : 0) - mouse.sx) * k;
    mouse.sy += ((cfg.mouseParallax ? mouse.y : 0) - mouse.sy) * k;
    if (mouse.has) { mouse.wx = wrapX(mouse.msx + cam.x); mouse.wy = mouse.msy + cam.y; }
    if (needsShip) buildShip();

    const looping = cfg.flightMode === 0;
    if (keys.up || keys.left || keys.right || keys.down || keys.strafeL || keys.strafeR) {
      lastKeyTime = time;
      if (rocket.mode !== 'manual') takeControl();
    }
    if (looping) updateLoop(dt, rocket.mode === 'auto');

    switch (rocket.mode) {
      case 'auto': if (!looping) updateAuto(dt); break;
      case 'manual': updateManual(dt); break;
      case 'drag': updateDrag(dt); break;
      case 'return':
        updateAuto(dt);
        if (rocket.state !== 'landed') rocket.returnArmed = true;
        else if (rocket.returnArmed) finishReturn();
        break;
      case 'dead':
        rocket.deadT += dt;
        if (rocket.deadT > 2.6) respawn();
        break;
    }
    if (rocket.blink > 0) rocket.blink -= dt;
    if (turboT > 0) turboT -= dt;
    if (keys.fire && cfg.keyboardControl) tryFire();

    updateAsteroids(dt, !looping);
    updateBullets(dt);
    updateUfo(dt);
    updateSputniks(dt);
    updateFoes(dt);
    updateCollisions();
    updateParticles(dt);
    updateShooting(dt, !looping);
    updateMissile(dt);
    updateCows(dt);
    updateEarth(dt);
    updateEconomy(dt);
    updateCamera(dt);
    flash = Math.max(0, flash - dt * 2.5);
    shake = Math.max(0, shake - dt * 1.5);
  }

  function render() {
    rcx = Math.round(cam.x); rcy = Math.round(cam.y);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = skyTopCol();
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.02) ctx.translate(Math.round(rand(-3, 3) * shake), Math.round(rand(-3, 3) * shake));

    ctx.drawImage(skyCanvas, 0, 0);
    const alt = CEIL ? clamp(-cam.y / CEIL, 0, 1) : 0;
    if (alt > 0.01) { ctx.globalAlpha = alt * 0.75; ctx.fillStyle = skyTopCol(); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

    // stars (parallax)
    const ox = -mouse.sx * 1.5, oy = -mouse.sy * 1.0;
    for (const s of stars) {
      const x = Math.round(mod(s.x - rcx * s.par + ox * s.layer, W));
      const y = Math.round(s.y - rcy * s.par + oy * s.layer);
      if (y < -1 || y > H) continue;
      const tw = 0.65 + 0.35 * Math.sin(twinklePhase(s));
      ctx.fillStyle = s.col;
      ctx.globalAlpha = s.bright * tw;
      ctx.fillRect(x, y, 1, 1);
      if (s.big) {
        ctx.globalAlpha = s.bright * tw * 0.45;
        ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;

    if (cfg.showEarth) drawEarth();

    // far ridge
    const roff = Math.round(mod(rcx * 0.5, RW)), ry = Math.round(-rcy * 0.5);
    ctx.drawImage(ridgeCanvas, -roff, ry);
    if (RW - roff < W) ctx.drawImage(ridgeCanvas, RW - roff, ry);

    drawShooting();

    // near surface
    const foff = mod(rcx, WW), fy = -rcy;
    ctx.drawImage(fgCanvas, -foff, fy);
    if (WW - foff < W) ctx.drawImage(fgCanvas, WW - foff, fy);

    drawGroundGlow();
    drawParticles(false);
    drawUfoBeam();
    drawAsteroids();
    drawBullets();
    drawPlasma();

    if (visibleRocket() && !(rocket.blink > 0 && Math.floor(time * 12) % 2)) {
      composeRocket();
      ctx.save();
      ctx.translate(Math.round(sxOf(rocket.x)), Math.round(syOf(rocket.y)));
      if (Math.abs(rocket.angle) > 0.004) ctx.rotate(rocket.angle);
      const sc = RS * (rocket.mode === 'abducted' ? rocket.abScale : 1);
      ctx.scale(sc, sc);
      ctx.drawImage(rocketCanvas, -HALF, -HALF);
      ctx.restore();
    }

    drawShield();
    drawUfo();
    drawSputniks();
    drawFoes();
    drawEscapees();
    drawParticles(true);
    drawFloaters();
    drawCows();
    drawMissile();
    ctx.restore();

    if (flash > 0.01) {
      ctx.globalAlpha = Math.min(1, flash) * 0.4;
      ctx.fillStyle = '#ffe6c0';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    drawHud(lastDt);
    if (menuOpen) drawMenu(lastDt);
  }

  function drawGroundGlow() {
    if (rocket.thrust < 0.05 || !visibleRocket()) return;
    const n = nozzleWorld();
    const alt = groundY(n.x) - n.y, reach = H * 0.22;
    if (alt > reach) return;
    const k = rocket.thrust * (1 - Math.max(0, alt) / reach);
    const rx = Math.round((22 + 20 * (1 - k)) * RS);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = isRainbow() ? rgbStr(hslRgb(time * 300, 1, 0.6)) : flamePal.base;
    const cx = Math.round(sxOf(n.x));
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (x < 0 || x >= W) continue;
      const f = 1 - Math.abs(x - cx) / rx;
      const a = Math.floor(k * f * f * 0.55 * 6 + bayer(x, 0)) / 6;
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(x, Math.ceil(syOf(groundY(x + rcx))), 1, Math.max(1, Math.round(3 * f * RS)));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  let raf = 0;
  let last = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const minStep = cfg.fpsLimit ? 1000 / cfg.fpsLimit : 0;
    const elapsed = now - last;
    if (elapsed < minStep - 0.5) return;
    last = minStep ? now - (elapsed % minStep) : now;
    const dt = Math.min(0.05, elapsed / 1000);
    if (needsRebuild) build();
    if (menuOpen) lastDt = dt; else update(dt);   // the game pauses while the menu is open
    render();
  }

  function setPaused(p) {
    if (p === paused) return;
    paused = p;
    if (paused) { cancelAnimationFrame(raf); raf = 0; }
    else if (!raf && !capturing) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }

  document.addEventListener('visibilitychange', () => {
    if (capturing) return;
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (!paused && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });

  // ---------------------------------------------------------------- hooks used to render the preview GIF and for testing
  let capturing = false;
  window.__moonLanderCapture = function () {
    capturing = true;
    cancelAnimationFrame(raf); raf = 0;
    if (needsRebuild) build();
    particles.length = 0; shooting.length = 0; asteroids.length = 0; bullets.length = 0;
    ufo = null; missile = null; cows.length = 0; plasma.length = 0; toasts.length = 0; sputniks.length = 0; foes.length = 0; boss = null; bossMeter = 0; bossDelay = 0;
    rocket.mode = 'auto'; hudAlpha = 0; turboT = 0; menuOpen = false; floaters.length = 0;
    earth.state = 'ok';
    cam.x = 0; cam.y = 0;
    loopClock = 0; vOff = 0;
    rocket.x = loop.padX; rocket.y = loop.padY; rocket.angle = loop.padA; rocket.thrust = 0;
    return loopTimes().period;
  };
  window.__moonLanderStep = function (dt) { if (needsRebuild) build(); update(dt); render(); };
  window.__moonLanderDebug = {
    state: () => ({
      mode: rocket.mode, state: rocket.state, x: rocket.x, y: rocket.y, vx: rocket.vx, vy: rocket.vy, angle: rocket.angle, w: rocket.w,
      grounded: rocket.grounded, cam: { ...cam }, PS, DPR, W, H, WW, CEIL, score: { ...score },
      asteroids: asteroids.map(a => ({ x: a.x, y: a.y, r: a.r })), ufo: ufo ? { x: ufo.x, y: ufo.y, state: ufo.state, hp: ufo.hp } : null,
      earth: earth.state, earthX: earth.x, earthY: earthScreenY(), earthR: earth.R, shooting: shooting.length,
      toasts: toasts.map(t => t.text), turbo: turboT
    }),
    asteroid: (x, y, size) => spawnAsteroid({ x, y, vx: 0, vy: 0, size, spin: 0.5 }),
    foes: (type, n) => spawnFoes(type, n), foeList: () => foes.map(f => ({ type: f.type, x: f.x, y: f.y, hp: f.hp, state: f.state, sub: f.sub })),
    foeTypes: () => Object.keys(FOE_TYPES), boss: () => spawnBoss(), bossKills: n => bossProgress(n),
    killBoss: () => { while (boss && foes.includes(boss)) damageFoe(foes.indexOf(boss)); },
    bossState: () => ({ active: !!boss, name: boss ? boss.def.name : '', hp: boss ? boss.hp : 0, max: boss ? boss.def.hp : 0, meter: bossMeter, at: BOSS_AT,
      delay: bossDelay, beaten: [...owned.bosses] }), hitFoe: () => { if (foes.length) damageFoe(foes.length - 1); },
    sputniks: n => spawnSputniks(n), sputnikList: () => sputniks.map(s => ({ x: s.x, y: s.y, state: s.state, hp: s.hp })),
    ufo: (hunt) => spawnUfo(hunt), shootUfo: () => damageUfo(), nuke: () => launchNuke(), cow: () => spawnCow(cam.x + W * 0.3),
    bsod: () => bsodEarth(), konami: () => konami(), pose: x => restPose(x),
    credits: n => { credits = n; saveGame(); },
    econ: () => ({ credits, up: { ...up }, shield: { ...shield }, menuOpen, menuTab, autopilot: cfg.autopilot,
      weapon: weaponDef.id, ship: shipDef.id, weapons: [...owned.weapons], ships: [...owned.ships],
      world: worldDef.id, worlds: [...owned.worlds], cheatsUnlocked, tabs: menuTabs(),
      heat, overheated, bullets: bullets.length, cheat: { ...cheat } }),
    weapon: id => setWeapon(id), ship: id => setShip(id), world: id => setWorld(id), fire: () => tryFire(),
    cheat: (flag, on) => { if (flag in cheat) cheat[flag] = !!on; },
    place: (x, y, a, vx = 0, vy = 0, w = 0, noIdle = false) => {
      Object.assign(rocket, { mode: 'manual', x, y, angle: a, vx, vy, w, grounded: false, keysUsed: true, airT: 2, sleepT: 0,
        releaseT: noIdle ? 1e12 : 0 });
      lastKeyTime = time;
    }
  };

  // ---------------------------------------------------------------- public API (used by web/shell.js)
  window.MoonLander = {
    mode: MODE,
    version: VERSION,
    setProperty: (name, value) => window.livelyPropertyListener(name, value),
    // name: 'up' | 'left' | 'right' | 'down' | 'fire' | 'strafeL' | 'strafeR' — used by the on-screen touch buttons
    key(name, down) {
      if (!(name in keys)) return;
      keys[name] = !!down;
      if (down) { if (name === 'fire') noteInteract(); else takeControl(); }
    },
    takeControl: () => takeControl(),
    toggleMenu: () => toggleMenu(),
    toggleAutopilot: () => toggleAutopilot(),
    cycleWeapon: () => cycleWeapon(),
    pause: p => setPaused(!!p),
    get paused() { return paused; },
    get menuOpen() { return menuOpen; },
    get credits() { return credits; },
    get weapon() { return weaponDef.id; },
    get ship() { return shipDef.id; },
    get world() { return worldDef.id; }
  };

  loadSave();
  raf = requestAnimationFrame(frame);
})();
