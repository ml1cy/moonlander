#!/usr/bin/env node
// Builds both targets from the shared engine. No dependencies.
//
//   node scripts/build.mjs            -> dist/web/ and dist/wallpaper/ + dist/moon-lander-wallpaper.zip
//   node scripts/build.mjs web        -> only dist/web/        (what Cloudflare runs)
//   node scripts/build.mjs wallpaper  -> only dist/wallpaper/ + zip
//
// Runs scripts/validate.mjs first and stops if it fails.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';
import { validate } from './validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const target = process.argv[2] || 'all';

const problems = validate(root);
if (problems.length) {
  console.error('Validation failed:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const engine = readFileSync(join(root, 'src/engine.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(pkg.version));
const sprite = readFileSync(join(root, 'src/rocket-data.js'));

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const s = join(from, f);
    if (statSync(s).isDirectory()) copyDir(s, join(to, f));
    else copyFileSync(s, join(to, f));
  }
}

// Stamp the version into a built page: the tab title becomes "Moon Lander V1.2.3", and (for the
// website) every local script/stylesheet URL gets ?v=1.2.3 so browsers can't keep serving an old
// engine.js from their cache after a new release.
function stampPage(file, bustCache) {
  let html = readFileSync(file, 'utf8');
  html = html.replace('<title>Moon Lander</title>', `<title>Moon Lander V${pkg.version}</title>`);
  if (bustCache) html = html.replace(/(src|href)="((?:rocket-data|engine|shell)\.js|style\.css)"/g, `$1="$2?v=${pkg.version}"`);
  if (!html.includes(`Moon Lander V${pkg.version}`)) throw new Error('could not stamp the version into ' + file);
  writeFileSync(file, html);
}

function buildWeb() {
  const out = join(root, 'dist/web');
  rmSync(out, { recursive: true, force: true });
  copyDir(join(root, 'web'), out);
  writeFileSync(join(out, 'engine.js'), engine);
  writeFileSync(join(out, 'rocket-data.js'), sprite);
  // one settings schema for both targets
  copyFileSync(join(root, 'wallpaper/LivelyProperties.json'), join(out, 'settings.json'));
  copyFileSync(join(root, 'wallpaper/thumbnail.jpg'), join(out, 'og.jpg'));
  stampPage(join(out, 'index.html'), true);
  console.log('built dist/web');
}

function buildWallpaper() {
  const out = join(root, 'dist/wallpaper');
  rmSync(out, { recursive: true, force: true });
  copyDir(join(root, 'wallpaper'), out);
  writeFileSync(join(out, 'engine.js'), engine);
  writeFileSync(join(out, 'rocket-data.js'), sprite);
  stampPage(join(out, 'index.html'), false);
  // Lively wants LivelyInfo.json at the root of the zip
  const files = readdirSync(out).sort().map(name => ({ name, data: readFileSync(join(out, name)) }));
  const zipPath = join(root, 'dist/moon-lander-wallpaper.zip');
  writeFileSync(zipPath, createZip(files));
  console.log('built dist/wallpaper and dist/moon-lander-wallpaper.zip (' + files.length + ' files)');
}

if (target === 'all' || target === 'web') buildWeb();
if (target === 'all' || target === 'wallpaper') buildWallpaper();
console.log('Moon Lander v' + pkg.version);
