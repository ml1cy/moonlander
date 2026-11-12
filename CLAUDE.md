# CLAUDE.md — Moon Lander

Guidance for Claude Code working in this repo. Read this first, then the doc in `docs/` that matches the task.

## What this is

A pixel-art moon lander that ships as **two products from one engine**:

| Target | Folder | Output | Runs in |
|---|---|---|---|
| Lively wallpaper | `wallpaper/` | `dist/moon-lander-wallpaper.zip` | Lively Wallpaper on Windows (WebView2/CEF) |
| Browser game | `web/` | `dist/web/` | Any browser; hosted on Cloudflare (Workers static assets) |

Both load the same `src/engine.js`. The difference is a host config set before the engine loads:

```html
<script>window.MOON_LANDER = { mode: 'wallpaper' };</script>                          <!-- wallpaper/index.html -->
<script>window.MOON_LANDER = { mode: 'game', defaults: { autopilot: false } };</script> <!-- web/index.html -->
```

## Layout

```
src/engine.js         The whole game: rendering, physics, enemies, economy, eggs, HUD, menu (one IIFE, no deps)
src/rocket-data.js    The rocket sprite as a data URL (see "Gotchas")
assets/rocket.png     Source sprite (64x64). Regenerate rocket-data.js if you change it
wallpaper/            Lively package: index.html, LivelyInfo.json, LivelyProperties.json, thumbnail.jpg, preview.gif
web/                  Game shell: index.html, shell.js (title/pause/settings/touch), style.css, favicon.png, _headers
scripts/build.mjs     Builds dist/web and dist/wallpaper (+zip). Runs validate first. No dependencies
scripts/validate.mjs  Static checks (Lively property rules, listener coverage, JS syntax, LivelyInfo)
scripts/zip.mjs       Tiny zip writer used by the build
scripts/serve.mjs     Local static server for dist/
tests/smoke.mjs       Playwright smoke test of both builds
docs/                 ARCHITECTURE, LIVELY, DEPLOY, TESTING
```

`dist/` is generated — never edit it. The version shown in-game comes from `package.json` (the build replaces `'__VERSION__'` in the engine).

## Commands

```bash
npm run validate          # fast static checks — run after every change
npm run build             # dist/web + dist/wallpaper + dist/moon-lander-wallpaper.zip
npm test                  # build + headless smoke test (needs: npm install && npx playwright install chromium)
npm run serve             # http://localhost:8080 serving dist/web   (node scripts/serve.mjs wallpaper for the other)
npm run deploy            # build web + wrangler deploy (Cloudflare)
```

Always finish a change with `npm run validate` and `npm test`.

## Golden rules

1. **One settings schema.** `wallpaper/LivelyProperties.json` drives Lively's Customise panel *and* the game's settings drawer (the build copies it to `dist/web/settings.json`). To add a setting:
   - add a default to `cfg` in `src/engine.js`,
   - add a `case 'name':` to `window.livelyPropertyListener` in the engine,
   - add the control to `LivelyProperties.json` **with a `"type"`** (see docs/LIVELY.md for the exact shapes),
   - if the game needs a different default or help text, add it to `WEB_DEFAULTS` / `HELP_OVERRIDE` in `web/shell.js`.
   `npm run validate` fails if a control has no valid type or no listener case.
2. **The idle animation must loop seamlessly** (wallpaper mode). Anything visible while nobody is playing must be driven by the loop clock and repeat exactly once per period. See "Loop determinism" in docs/ARCHITECTURE.md before touching `updateLoop`, Earth, stars or anything spawned during idle.
3. **New enemies/events only appear while the player is flying** (`rocket.mode === 'manual' | 'drag'`), and must retreat/stop when autopilot takes over, so the idle loop is untouched.
4. **Never assume coordinates don't wrap.** The world is `WW` px wide and wraps. Use `wd(dx)` for distances, `wrapX(x)` to store positions, `sxOf(x)/syOf(y)` to draw, `groundY(x)` for terrain.
5. **Keep both shells thin.** Game logic goes in the engine; the shells only host it. The game shell talks to the engine only through `window.MoonLander` and `window.livelyPropertyListener`.
6. **No build tooling, no dependencies at runtime.** Plain ES2020 in the browser; Node built-ins only in scripts.

## Gotchas (each of these has bitten this project)

- **Every control in LivelyProperties.json needs `"type"`.** One missing type breaks the *whole* Customise panel with `Control type '' is not supported`. Lively also keeps its own copy of the properties file per installed wallpaper, so a fix only shows after the user deletes the wallpaper and re-imports the zip.
- **Canvas tainting:** the sprite is recoloured with `getImageData`. Loading `rocket.png` from `file://` would taint the canvas in Lively, so the sprite is embedded as a data URL in `src/rocket-data.js`. Keep it that way.
- **Lively input:** keyboard input reaches the wallpaper only if the user enables it (Lively → Settings → Wallpaper → Interaction → Wallpaper Input → Keyboard). Mouse input arrives as plain mouse events, which is why the wallpaper uses `mousedown`/`mousemove` while the game uses pointer events.
- **Key conflicts:** typed easter-egg codes (NUKE, UFO, MOO, BSOD, BEEP, Konami) share the keyboard with controls. Tab/G open the hangar menu, H toggles autopilot, Q switches weapon, so G, H and Q can't appear in codes. Ctrl+Alt+Shift+G reveals the hidden Cheats tab and is checked before the plain G shortcut. Check `eggKey()` before adding a key.
- **Focus in the game:** clicked buttons keep focus; `web/shell.js` blurs them so Space/arrows/Tab reach the engine. The engine ignores keys whose target is an INPUT/SELECT/TEXTAREA.
- **Worlds override the colour settings.** `groundCol()/skyTopCol()/skyBotCol()` return the current world's palette and fall back to the `cfg` colours on the Moon; never read `cfg.groundColor`/`cfg.skyTop`/`cfg.skyBottom` directly. `earth` is whichever body the world puts in the sky (`BODIES`), so use `earth.name` in messages.
- **Ship types share one hull.** `shapeShip()` only redraws the sprite; `HULL`, `restPose` and the feet are the same for every ship, and ship stats are multipliers (`thrust`, `turn`, `hull`, `cool`, `shield`). Keep a new ship's feet within a few px of the original.
- **Physics tuning is fragile.** Landing uses rigid-body contact impulses with leg damping and a "legs bed in" settle step. Re-run the landing tally in docs/TESTING.md after changing `contactPass`, `HULL`, gravity, thrust or `settle`.

## Debug hooks (available in both builds)

`window.__moonLanderDebug`: `state()`, `econ()`, `place(x,y,angle,vx,vy,w,noIdle)`, `asteroid(x,y,size)`, `sputniks(n)`, `sputnikList()`, `ufo(hunt)`, `shootUfo()`, `nuke()`, `cow()`, `bsod()`, `konami()`, `pose(x)`, `credits(n)`, `weapon(id)`, `ship(id)`, `world(id)`, `fire()`, `cheat(flag, on)`, `foes(type, n)`, `foeList()`, `foeTypes()`, `hitFoe()`.
`window.__moonLanderCapture()` resets to the start of the idle loop and stops the RAF loop; then step frames deterministically with `window.__moonLanderStep(dt)`. Used for the preview GIF and loop-seam checks.

## Where things live in src/engine.js (search for the banner comments)

`config` → `helpers` → `canvas & world` (build, terrain, ridge, sky, stars) → `Earth` → `ship sprite & colours` → `particles` → `shooting stars` → `asteroids` → `rocket` (+ `autopilot`, `clean loop`) → `manual flight (rigid body)` → `drag & throw` → `crash & respawn` → `weapons & bullets` → `UFO` → `Sputniks` → `natives & mines` → `easter eggs` → `credits & upgrades` (+ menu) → `HUD & toasts` → `collisions` → `camera` → `input` → `main loop` → `hooks` → `public API`.
