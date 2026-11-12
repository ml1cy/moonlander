# Changelog

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
