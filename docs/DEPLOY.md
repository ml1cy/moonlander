# Deploying

## Browser game → Cloudflare

The game is a static site in `dist/web/` (built by `npm run build:web`). `wrangler.jsonc` deploys it as a Worker with static assets — no server code.

### Option A: connect the GitHub repo (recommended, deploys on every push)

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick the repo.
3. Build settings:
   - **Build command:** `npm run build:web`
   - **Deploy command:** `npx wrangler deploy` (the default)
   - Root directory: leave empty (repo root)
4. Deploy. You get a `*.workers.dev` URL; add a custom domain under the Worker's **Settings → Domains & Routes**.

Pushes to the production branch (default `main`) deploy automatically; other branches get preview builds.

### Option B: deploy from your machine

```bash
npm install
npx wrangler login
npm run deploy        # = build:web + wrangler deploy
```

### Option C: Cloudflare Pages

Pages also works: **Workers & Pages → Create → Pages → Connect to Git**, framework preset *None*, build command `npm run build:web`, build output directory `dist/web`. (Delete or ignore `wrangler.jsonc` in that case.)

### Notes

- `web/_headers` sets security headers and short cache lifetimes for JS/JSON; it is copied into `dist/web/`.
- The page loads the "Press Start 2P" font from Google Fonts; if blocked it falls back to monospace.
- Saves (credits/upgrades/settings) live in the visitor's browser `localStorage` for that domain. Changing domains starts players fresh.
- `"not_found_handling": "single-page-application"` serves `index.html` for unknown paths.

## Wallpaper → Lively

```bash
npm run build:wallpaper     # dist/moon-lander-wallpaper.zip
```

Attach the zip to a GitHub Release, or drag it straight into Lively. Remind users to remove the previous version from their Lively library first (see docs/LIVELY.md).

## Versioning

Bump `version` in `package.json` and add a `CHANGELOG.md` entry. The build stamps the version into the engine (`MoonLander.version`, shown at the bottom of the game's settings drawer).
