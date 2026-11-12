# Architecture

## Frame loop

`frame()` (requestAnimationFrame, capped by `cfg.fpsLimit`) → `build()` if `needsRebuild` → `update(dt)` (skipped while the upgrades menu is open) → `render()`.

`dt` is clamped to 50 ms. `time` is the engine clock; `loopClock` is the idle-loop clock.

## Resolution & coordinates

- The canvas is rendered at low resolution and scaled up with nearest-neighbour. `PS` = screen pixels per art pixel (from `cfg.pixelSize`, scaled to screen height). `W × H` is the screen in art pixels. `S = H / 360` scales sizes so the look is resolution independent. `RS` = rocket sprite scale (1–3).
- **World:** `WW = W × cfg.worldSize` wide, wrapping horizontally. Sky extends `CEIL` px above the top of the home screen (0 when worldSize is 1).
- **Camera:** `cam.x` (unbounded; never wrap it, the parallax layers depend on continuity) and `cam.y ∈ [-CEIL, 0]` (the lower bound rises as the camera zooms out, reaching 0 when the whole arena is in view). Rendering uses `rcx/rcy` (rounded camera) via `sxOf(x)` / `syOf(y)`.
- **Pixel density:** the canvas is `W·density × H·density` and `render()` starts with `setTransform(density, …)`, so all drawing code keeps working in art pixels. `updateDensity()` raises `density` to `ceil(1 / zoom)` (capped at `PS`, the screen's own resolution, and 4) as the camera zooms out, with a little hysteresis; it is 1 whenever `zoom` is 1, so the idle loop is unchanged. Never draw with `putImageData` on the main canvas or read `canvas.width` as `W`.
- **Zoom:** while the player flies, `updateZoom` sets `zoom` from the ship's height above the ground (`0.65·H / (height + 0.2·H)`, clamped to `[W / WW, 1]`), so the ground stays at the bottom of the screen and the ship about a third of the way down. The arena is `worldSize` screens wide *and* tall (`CEIL = (worldSize − 1)·H`), so at `W / WW` exactly the whole arena is in view. It is always 1 in the idle loop. `dotSize()` keeps shots visible and floaters are drawn at constant screen size. `render()` scales the world layer (terrain to front particles) about the bottom-centre of the screen and the far ridge by three quarters as much; sky, stars and the sky body are not scaled. `viewL/viewR/viewT/viewH` give the visible world rectangle and `offView` culls in `sxOf/syOf` space.
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
- Strafe: Q / E add `STRAFE()` (`0.13·H` × ship thrust) along the ship's own left-right axis; they count as steering for waking a landed ship.
- Rotation: angular velocity `w`, side thrusters add `±2.4 rad/s² × steering%`, cap 2.6 rad/s, light spin friction (more with the Gyro upgrade). **Nothing levels the ship** — that's a deliberate design choice the owner asked for.
- 4 substeps per frame. `contactPass()` tests the `HULL` points against the terrain and applies normal + friction impulses (restitution 0.12, μ 0.8), with position correction through the same effective mass so a sunk foot pivots the hull instead of lifting it. Contact normals use the broad slope (±4 px), feet flatter still, so 1-px jaggies don't twist the ship.
- Landing: when both feet touch, tilt vs terrain < 0.42 rad and the ship is slow, the legs "bed in" to `restPose` and the ship sleeps (`settle(pose)`, +$10, "NICE LANDING"). Beyond that it tips over ("HOUSTON, WE HAVE A PROBLEM").
- Crashes: foot impact > `0.32·H` or body impact > `0.17·H` (× Landing Legs upgrade × the ship's `hull`) explodes the ship if `cfg.crashes`, unless a shield charge absorbs it (1 s grace after).

## Loop determinism (wallpaper idle)

The wallpaper's idle animation must be a perfect loop of `period = flight + rest` seconds (`loopTimes()`):

- Rocket position is a pure function of `loopClock` along a Catmull-Rom path (`loopPos`).
- Earth turns exactly once per period (`earthRot`), stars twinkle a whole number of times per period (`twinklePhase`). Both use `vClock() = loopClock + vOff`; `finishReturn()` adjusts `vOff` when it jumps the loop clock so nothing visibly jumps.
- Shooting stars and asteroids during idle are **scheduled** at fixed fractions of the period (`loop.shots`, `loop.rocks`) and are gone before the period ends.
- Random spawns (UFOs, Sputniks, random asteroids/shooting stars) are only allowed when not in Clean loop idle.

Check after any change to idle visuals: render one period with `__moonLanderCapture()` + `__moonLanderStep()`, and compare the last frame to the first — the difference must be about the size of an ordinary frame-to-frame difference (see docs/TESTING.md).

## Economy

`credits`, upgrade levels `up` and `score` are saved to `localStorage['moonLander.save.v1']` (per origin, so the wallpaper and the website keep separate saves). Earn: star 5, asteroid 2/4/7, landing 10, rescue 25, Sputnik 15 (+20 per full squadron), UFO 50. Crash: −10.

Upgrades (`UPGRADES` array; cost = base × 1.7^level): Engine, Gyro, Landing Legs, Laser, Shield, Star Magnet, Rainbow Exhaust.

**Hangar menu:** Tab/G or the HUD button; the game pauses while it's open. Tabs (`menuTabs()`): Upgrades, Weapons, Ships, Worlds, and Cheats (only after it has been unlocked with Ctrl+Alt+Shift+G, and never when `cfg.cheats` is off); ← → / A D or a click switch tabs. `menuRows()` returns the current tab's rows as `{ name, desc, right, col, pips?, act }`, so drawing, clicks and the 1–9 keys are shared by every tab (keep each tab ≤ `MENU_MAX_ROWS` = 11 rows including Close; keys 1–9 and 0 pick the first ten).

## Weapons, heat and ships

- **Weapons** (`WEAPONS`): `cd` is the time between shots, `heat` the heat added per shot. Laser (spread comes from the Laser upgrade), Scatter Gun (5 short-lived pellets), Railgun (`pierce` bullets that remember what they already hit in `b.hit`), Missiles (`kind: 'missile'`, steered by `steerMissile`, area damage in `blastAt`). All of them are entries in `bullets[]`. R / `MoonLander.cycleWeapon()` cycles through the owned ones.
- **Heat:** `heat` (0–1) rises per shot and falls by `HEAT_COOL` per second (× the ship's `cool`). At 1 the weapon is `overheated` and `tryFire()` refuses until heat is back under `HEAT_READY`; it cools 1.5× faster while locked. Turbo halves heat per shot.
- **Ships** (`SHIPS`): multipliers for thrust, turning, crash tolerance (`hull`), weapon cooling (`cool`) and bonus shield charges. `shapeShip()` reshapes the recoloured sprite; the collision hull is shared. The Gunship fires from its side cannons (`muzzleWorld()`).
- Owned weapons/ships and the equipped ones are stored in the same save as credits.
- **Worlds** (`WORLDS`, near the config): `grav` multiplies gravity, `stars` the star density, `ground`/`skyTop`/`skyBottom` replace the colour settings (the Moon has none, so it keeps using them), and `body` + `bodyScale` pick what `buildEarth()` puts in the sky from `BODIES` (a `tex(x, y, z)` colour function, optional atmosphere tint, halo, `unlit` for the Sun, `rings` for Saturn). `setWorld()` triggers a rebuild; each world gets its own terrain seed. The sky body keeps Earth's one-turn-per-loop rotation, so the idle loop stays seamless on every world.
- **Cheats tab unlock:** `toggleCheatsUnlock()` (Ctrl+Alt+Shift+G) flips `cheatsUnlocked` (saved) and toasts CHEATS UNLOCKED / CHEATS HIDDEN; hiding also clears the cheat flags.
- **Cheats** (`CHEATS`, `cheat` flags): god mode, no overheat and low gravity are per-session toggles; the others act once (and what they unlock is saved).

To add an upgrade: add an entry to `UPGRADES`, a key to `up`, and read `up.<id>` where it takes effect. Rows lay out automatically (keep the total ≤ 9 for the number keys).

## Enemies & events

- **Asteroids** — ambient; click, shoot or ram. Sizes split 2 → 1 → 0.
- **UFO** — visits while playing; hunts the ship with a tractor beam (abduction → returned later, or rescued if shot down). Fires plasma when angry. 3 HP.
- **Sputniks** — squadrons of 1–3 while flying manually over the Moon or Earth; orbit the ship, fire pellets, dive to ram. 2 HP. Retreat when autopilot engages.
- **Natives & mines** (`FOE_TYPES`, `foes[]`) — one generic enemy system. A type is data: a pixel sprite (`rows` + `pal`, drawn at `foeUnit()` scale), `hp`, `reward`, hit radius `r`, an `ai` (`walker`, `hover`, `diver`, `blinker`, `mine`) and optionally a `shot` pattern (`aim`, `spread`, `drop`, `lob`). `NATIVES` maps a world id to its type; worlds without an entry (Moon, Earth) get Sputniks. `updateFoes` spawns a native wave (or a minefield, or Sky Raiders once `altFrac()` is above 0.35) only while the player is flying — faster, bigger and overlapping more with altitude — and switches everything to `leave` when autopilot takes over. To add an enemy: add a `FOE_TYPES` entry and, for a world's native, a `NATIVES` entry. Bullets, missiles, blasts, clicks and ramming all go through `foeHit` / `damageFoe`.
- **Bosses** (`BOSSES`, keyed by world id) — a boss is a foe with `ai: 'boss'`, `boss: true` and `scale: 3`, stored in `foes[]` (and referenced by `boss`), so every weapon already hits it. Most are a crowned, scaled-up copy of the world's native (`kingOf`). `bossProgress()` counts kills; at `BOSS_AT` it warns and `spawnBoss()` follows. `updateBoss` moves it (`move`: hover, `above`, `ground`, `blink`) and runs `def.attacks` in order through `bossAttack` (`burst`, `ring`, `rain`, `lob`, `charge`, `summon`, `mines`); below half health it is `raged` and attacks faster. While a boss is out, no UFO, Sputnik or native waves spawn on their own. It leaves when autopilot takes over (the meter drops to `BOSS_AT - 3`). `bossDefeated` pays the reward and records the world in `owned.bosses` (saved).
- **Easter eggs** — NUKE / Earth ×5 click, UFO, MOO / triple-click ground, BSOD, BEEP, Konami code.

Projectiles that hurt the ship go in `plasma[]` (`col`/`core` set the colour, `g` adds gravity for arcing shots); the hit logic there already handles shields, crashes and knockback.

## Game shell (web/shell.js)

Builds the settings drawer from `settings.json`, saves values to `localStorage['moonLander.settings.v1']`, and replays them into `livelyPropertyListener` on load (exactly like Lively). Title screen → `MoonLander.takeControl()`. Esc/P pause via `MoonLander.pause()`; a capture-phase keydown listener keeps keys away from the engine while paused. Touch buttons call `MoonLander.key(name, down)`.
