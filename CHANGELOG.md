# Changelog

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
