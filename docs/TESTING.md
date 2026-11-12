# Testing

## Every change

```bash
npm run validate     # property schema, listener coverage, JS syntax, LivelyInfo
npm test             # build + Playwright smoke test of both builds (screenshots in test-results/)
```

First-time setup for tests: `npm install && npx playwright install chromium`.

`tests/smoke.mjs` covers: both targets boot in the right mode; every Lively property can be applied; pause hook; arrow keys take control; the game's title → play, pause/resume, hangar menu open/close and tabs, buying a weapon, a ship and a world, the hidden cheats shortcut, all ten worlds building, every enemy type spawning and dying, the reset-progress row, Q / E strafing, the altitude zoom, the briefing / mission complete / travel flow and locked worlds, a full launch-space-entry trip with steering, the boss meter and a boss fight on every world, every weapon firing, overheat and recovery, settings drawer generated + persisted; enemies/easter eggs run without errors; phone layout shows touch controls.

## Deterministic stepping

```js
const period = window.__moonLanderCapture();   // stops RAF, resets to the start of the idle loop
window.__moonLanderStep(1 / 60);               // advance one frame (update + render)
window.__moonLanderDebug.state();              // rocket mode/pose, camera, score, earth state...
```

Useful recipes (run in Playwright `page.evaluate`):

- **Landing tally** (after touching physics): for ~12 random x across `WW`, `place(x, H*0.55, tilt, 0, 0, 0, true)` (last arg disables autopilot), step ~6 s, then compare `state().angle` with `pose(x).a`. Expected: tilt 0 and 0.2 → ~85–100 % stand upright on their legs; tilt 0.6 → always tip over.
- **Steering feel**: `place(...)`, hold ArrowRight 15 frames, release; `w` should be ≈ 0.6 rad/s and decay slowly.
- **Autopilot**: with `cfg.autopilot` on, a manual ship left alone switches to `return` after `idleReturn` s (default 20) and not before.

## Loop seam (wallpaper idle)

After changing anything visible during idle:

1. `__moonLanderCapture()`, step one full period to warm up, then step and screenshot `N = round(period * 12)` frames at `dt = period / N`.
2. Count changed pixels between the last and first frame and between neighbouring frames. The seam must be about the same size as an ordinary neighbour difference (previous runs: seam 3861 vs neighbours 2500–3650; Earth region 1989 vs 1944).

## Preview GIF / thumbnail

Same capture as above at 1920×1080, frames downscaled to 480×270, quantised to one shared palette (taken from a frame ~20 % into the loop), 83 ms per frame, `loop=0`. Thumbnail = frame at 20 %, 640×360 JPEG. Save to `wallpaper/preview.gif` and `wallpaper/thumbnail.jpg` (thumbnail also becomes the website's `og.jpg`).
