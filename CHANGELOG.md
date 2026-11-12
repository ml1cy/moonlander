# Changelog

## 1.7.0 — 2026-11-12

- **Side Thrusters upgrade** — five levels in the hangar's Upgrades tab. Each level makes the Q / E side thrusters 20 % stronger and turning 6 % quicker.

## 1.6.0 — 2026-11-12

- **Campaign** — worlds are now unlocked by beating bosses instead of being bought. The route is Moon → Mercury → Venus → Mars → Io → Titan → Miranda → Triton → Pluto → Earth. Unlocked worlds can be revisited from the Worlds tab; locked ones say which boss to beat.
- **Mission screens** — a briefing the first time you fly on a world (story, target), and MISSION COMPLETE after its boss falls (reward, worlds cleared, what happens next), with a choice to fly on or stay.
- **Travel animation** — the ship flies from the old world to the new one; Enter, Space or a tap skips it.
- **Story** — a signal is turning every machine and creature hostile, relayed from world to world; follow it home.
- **Touch** — on-screen buttons for the Q / E side thrusters.
- New "Story and mission screens" setting (off = instant travel, no screens).

## 1.5.2 — 2026-11-12

- **Sharper zoom** — the canvas now gains pixel density as the camera zooms out (2× below full size, 3× when the whole arena is in view, up to the screen's own resolution). A zoomed-out ship or enemy keeps every pixel of its sprite instead of being squashed into a third of them. Near the ground it is the usual chunky 1× canvas.

## 1.5.1 — 2026-11-12

- **Zoom shows the whole arena** — the zoom is now tied directly to the ship's height: the view grows so the ground stays at the bottom of the screen, until the entire arena is in view at the top of the sky. The arena is now as many screens tall as it is wide (the "World size" setting), so the fully zoomed-out view shows exactly all of it.
- Shots and the +$ labels keep a readable size when zoomed out.

## 1.5.0 — 2026-11-12

- **Altitude zoom** — the camera pulls back as you climb and closes in again as you descend; the idle loop always plays at 1:1. New "Zoom out at altitude" setting.
- **More enemies** — waves arrive about twice as often and are bigger. The higher you fly, the faster they come, the more ships per wave, and new waves can arrive before the last one is cleared.
- **Sky Raiders** — a new fighter squadron that joins in at altitude on every world (and replaces ground walkers up there, since they can't reach you).

## 1.4.0 — 2026-11-12

- **Boss fights** — every world has a boss: Sputnik Prime (Moon), Helios (Mercury), The Cloud Queen (Venus), Defence Station (Earth), The Tripod King (Mars), The Magma King (Io), The Kraken (Titan), The Ice Queen (Miranda), The Trident (Triton) and The Ninth Planet (Pluto). Eight kills on a world fill the boss meter in the HUD; the boss then arrives with a health bar, cycles through its attacks (bursts, rings, rain, lobbed volleys, charges, minions, mines) and speeds up below half health. Beaten bosses are saved and marked in the Worlds tab; beating all ten pays a bonus. New "Boss fights" setting, and a Summon Boss cheat.
- **Strafe thrusters** — Q and E push the ship left and right along its own axis without turning it. Switching weapon moved from Q to R.

## 1.3.0 — 2026-11-12

- **Planet natives** — every world except the Moon and Earth has its own enemies while you fly: Sun Sprites (Mercury, dive-bombers), Venusians (hover overhead and drip acid), Martians (tripods that walk the ground and fire heat rays), Ionians (lava crabs that lob arcing lava), Titans (tough, triple shots), Mirandans (ice shards that dash), Tritonians (fast orbiters) and Plutonians (teleport in, fire, vanish).
- **Mines** — minefields drift in on any world; a mine explodes next to the ship or when shot, and its blast sets off rocks, enemies and other mines.
- Sputniks now only attack over the Moon and Earth. New "Planet natives and mines" setting; new ALIENS counter in the HUD.
- **Reset progress** — a RESET PROGRESS row in the hangar's Upgrades tab (press twice to confirm) wipes credits, upgrades, weapons, ships, worlds and score.

## 1.2.0 — 2026-11-12

- **Solar system** — a Worlds tab in the hangar unlocks Mercury, Venus, Earth, Mars, Io, Titan, Miranda, Triton and Pluto. Each has its own terrain, colours, star density and gravity, and its own body in the sky: the Sun, the Moon, Jupiter, ringed Saturn, Uranus, Neptune or Charon.
- **Cheats are hidden** — the Cheats tab only appears after Ctrl+Alt+Shift+G, which pops up "CHEATS UNLOCKED". Pressing it again hides the tab and switches cheats off. The setting is now "Allow the secret cheats menu".
- The Earth easter eggs work on whatever is in the sky.

## 1.1.0 — 2026-11-12

- **Weapon heat** — every shot heats the gun and it cools on its own; at 100 % it overheats and locks until it has cooled down. A heat gauge sits next to the weapon name in the HUD.
- **Weapons** — Laser (free), Scatter Gun, Railgun (pierces) and homing Missiles (area blast). Buy them in the hangar, switch in flight with Q (or the WPN touch button).
- **Ships** — Classic, Dart (fast, fragile), Hauler (tough, +1 shield, sluggish) and Gunship (twin cannons that cool faster). Each reshapes the sprite and keeps your colours.
- **Hangar menu** — the upgrades menu now has tabs: Upgrades, Weapons, Ships, Cheats (← → or click to switch).
- **Cheats** — add credits, god mode, no overheat, low gravity, unlock everything, max upgrades, turbo, clear enemies. New "Cheats tab" setting hides the tab.

## 1.0.0 — 2026-11-12

First repository release. Split into two targets sharing one engine:

- **Wallpaper** (`wallpaper/`) — Lively package, unchanged behaviour.
- **Browser game** (`web/`) — title screen over the idle loop, pause (Esc/P), settings drawer generated from the same schema as Lively's Customise panel, on-screen touch controls, Cloudflare deployment config.
- Build/validate/zip scripts (no dependencies) and a Playwright smoke test.
- `npm run validate` now catches the class of bug that broke the Customise panel (a control without `"type"`, or a setting with no listener case).

### History before the repo

- **Sputniks** — enemy squadrons that orbit, shoot and ram while you fly.
- **Credits & upgrades** — earn from stars/asteroids/UFOs/Sputniks/landings; Engine, Gyro, Landing Legs, Laser, Shield, Star Magnet, Rainbow Exhaust. Saved locally.
- **Autopilot toggle** (H) with a 20 s idle timer; gentler steering + sensitivity setting.
- **Fixed** Lively Customise error `Control type '' is not supported` (a slider had lost its `"type"`).
- **Rigid-body landing physics** (no auto-levelling, ships tip over), multi-screen wrapping world with camera, rotating Earth with city lights, ship recolouring, easter eggs (nuke + restore from backup, UFO abduction, cow, BSOD, Konami turbo).
- **Interactive layer** — fly with the keyboard, drag/throw the rocket, asteroids, catchable shooting stars, HUD.
- **Clean loop** — the idle animation repeats seamlessly.
- **Initial wallpaper** — pixel-art rocket hopping across the Moon.
