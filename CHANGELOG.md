# Changelog

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
