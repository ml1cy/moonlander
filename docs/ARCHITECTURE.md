# Architecture

## Frame loop

`frame()` (requestAnimationFrame, capped by `cfg.fpsLimit`) → `build()` if `needsRebuild` → `update(dt)` (skipped while the upgrades menu is open) → `render()`.

`dt` is clamped to 50 ms. `time` is the engine clock; `loopClock` is the idle-loop clock.

## Resolution & coordinates

- The canvas is rendered at low resolution and scaled up with nearest-neighbour. `PS` = screen pixels per art pixel (from `cfg.pixelSize`, scaled to screen height). `W × H` is the screen in art pixels. `S = H / 360` scales sizes so the look is resolution independent. `RS` = rocket sprite scale (1–3).
- **World:** `WW = W × cfg.worldSize` wide, wrapping horizontally. Sky extends `CEIL` px above the top of the home screen (0 when worldSize is 1).
- **Camera:** `cam.x` (unbounded; never wrap it, the parallax layers depend on continuity) and `cam.y ∈ [-CEIL, 0]`. Rendering uses `rcx/rcy` (rounded camera) via `sxOf(x)` / `syOf(y)`.
- **Helpers:** `wrapX(x)` (store), `wd(dx)` (shortest wrapped delta — use for every distance/direction), `groundY(x)` (terrain height, wraps), `restPose(x)` (where/at what angle a ship rests on the terrain).
- **Home view:** world x ∈ [0, W], cam = (0,0). The idle loop happens here and the camera eases back to it when the ship is on autopilot inside it.

## Layers (render order)

sky (screen-fixed canvas) → altitude darkening → stars (parallax 0.03–0.12) → Earth (vertical parallax 0.06) → far ridge (parallax 0.5, period `RW = 2W`) → shooting stars → near terrain (`fgCanvas`, `WW × H`) → engine glow → back particles → UFO beam → asteroids → bullets → plasma/pellets → rocket → shield → UFO → Sputniks → escapees → front particles → floaters (+$) → cows → missile → flash → HUD → upgrades menu.

Terrain, ridge and noise use `loopNoise`/`loopFbm` (noise sampled on a circle) so the world has no seam where it wraps.

## Rocket modes (`rocket.mode`)

| mode | who drives | notes |
|---|---|---|
| `auto` | idle loop (`updateLoop`) in Clean loop mode, `updateAuto` in Random hops | default |
| `manual` | player; rigid-body physics in `updateManual` | `grounded` = asleep on the surface |
| `drag` | mouse/pointer | release → `manual` with throw velocity |
| `return` | `updateAuto` flying to the loop pad | `finishReturn()` rejoins the loop |
| `dead` | — | respawns after 2.6 s |
| `abducted` / `taken` | UFO | returned or rescued |

Autopilot (`cfg.autopilot`, H key): when on, `idleCheck()` calls `startReturn()` after `cfg.idleReturn` seconds with no input. When off, nothing takes the ship from the player.

## Physics (manual)

- Gravity `0.10·H` px/s², thrust `0.27·H` (× engine upgrade, × turbo).
- Rotation: angular velocity `w`, side thrusters add `±2.4 rad/s² × steering%`, cap 2.6 rad/s, light spin friction (more with the Gyro upgrade). **Nothing levels the ship** — that's a deliberate design choice the owner asked for.
- 4 substeps per frame. `contactPass()` tests the `HULL` points against the terrain and applies normal + friction impulses (restitution 0.12, μ 0.8), with position correction through the same effective mass so a sunk foot pivots the hull instead of lifting it. Contact normals use the broad slope (±4 px), feet flatter still, so 1-px jaggies don't twist the ship.
- Landing: when both feet touch, tilt vs terrain < 0.42 rad and the ship is slow, the legs "bed in" to `restPose` and the ship sleeps (`settle(pose)`, +$10, "NICE LANDING"). Beyond that it tips over ("HOUSTON, WE HAVE A PROBLEM").
- Crashes: foot impact > `0.32·H` or body impact > `0.17·H` (× Landing Legs upgrade) explodes the ship if `cfg.crashes`, unless a shield charge absorbs it (1 s grace after).

## Loop determinism (wallpaper idle)

The wallpaper's idle animation must be a perfect loop of `period = flight + rest` seconds (`loopTimes()`):

- Rocket position is a pure function of `loopClock` along a Catmull-Rom path (`loopPos`).
- Earth turns exactly once per period (`earthRot`), stars twinkle a whole number of times per period (`twinklePhase`). Both use `vClock() = loopClock + vOff`; `finishReturn()` adjusts `vOff` when it jumps the loop clock so nothing visibly jumps.
- Shooting stars and asteroids during idle are **scheduled** at fixed fractions of the period (`loop.shots`, `loop.rocks`) and are gone before the period ends.
- Random spawns (UFOs, Sputniks, random asteroids/shooting stars) are only allowed when not in Clean loop idle.

Check after any change to idle visuals: render one period with `__moonLanderCapture()` + `__moonLanderStep()`, and compare the last frame to the first — the difference must be about the size of an ordinary frame-to-frame difference (see docs/TESTING.md).

## Economy

`credits`, upgrade levels `up` and `score` are saved to `localStorage['moonLander.save.v1']` (per origin, so the wallpaper and the website keep separate saves). Earn: star 5, asteroid 2/4/7, landing 10, rescue 25, Sputnik 15 (+20 per full squadron), UFO 50. Crash: −10.

Upgrades (`UPGRADES` array; cost = base × 1.7^level): Engine, Gyro, Landing Legs, Laser, Shield, Star Magnet, Rainbow Exhaust. Menu: Tab/G or the HUD button; rows are clickable or 1–9; the game pauses while it's open.

To add an upgrade: add an entry to `UPGRADES`, a key to `up`, and read `up.<id>` where it takes effect. Rows lay out automatically (keep the total ≤ 9 for the number keys).

## Enemies & events

- **Asteroids** — ambient; click, shoot or ram. Sizes split 2 → 1 → 0.
- **UFO** — visits while playing; hunts the ship with a tractor beam (abduction → returned later, or rescued if shot down). Fires plasma when angry. 3 HP.
- **Sputniks** — squadrons of 1–3 while flying manually; orbit the ship, fire pellets, dive to ram. 2 HP. Retreat when autopilot engages.
- **Easter eggs** — NUKE / Earth ×5 click, UFO, MOO / triple-click ground, BSOD, BEEP, Konami code.

Projectiles that hurt the ship go in `plasma[]` (`col`/`core` set the colour); the hit logic there already handles shields, crashes and knockback.

## Game shell (web/shell.js)

Builds the settings drawer from `settings.json`, saves values to `localStorage['moonLander.settings.v1']`, and replays them into `livelyPropertyListener` on load (exactly like Lively). Title screen → `MoonLander.takeControl()`. Esc/P pause via `MoonLander.pause()`; a capture-phase keydown listener keeps keys away from the engine while paused. Touch buttons call `MoonLander.key(name, down)`.
