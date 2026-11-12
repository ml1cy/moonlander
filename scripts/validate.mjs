#!/usr/bin/env node
// Static checks that catch the mistakes this project has actually hit.
//   node scripts/validate.mjs
//
// 1. LivelyProperties.json: every control has a type Lively's parser accepts
//    (a missing "type" makes Lively's Customise panel fail with "Control type '' is not supported").
//    Rules mirror Lively.Common/JsonConverters/LivelyControlModelConverter.cs.
// 2. Required fields per control type.
// 3. Every non-label property is handled by a `case '<name>':` in the engine's
//    livelyPropertyListener (otherwise the setting silently does nothing).
// 4. JavaScript files parse.
// 5. LivelyInfo.json points at files that exist.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const LIVELY_TYPES = new Set(['slider', 'textbox', 'dropdown', 'folderdropdown', 'scalerdropdown', 'button', 'color', 'checkbox', 'label']);
const REQUIRED = {
  slider: ['text', 'min', 'max', 'value'],
  dropdown: ['text', 'items', 'value'],
  color: ['text', 'value'],
  checkbox: ['text', 'value'],
  button: ['text', 'value'],
  textbox: ['text', 'value'],
  label: ['value']
};

export function validate(root) {
  const problems = [];
  const read = p => readFileSync(join(root, p), 'utf8');

  let props = {};
  try { props = JSON.parse(read('wallpaper/LivelyProperties.json')); }
  catch (e) { return ['wallpaper/LivelyProperties.json is not valid JSON: ' + e.message]; }

  const engine = read('src/engine.js');
  for (const [name, ctl] of Object.entries(props)) {
    if (!ctl || typeof ctl !== 'object') { problems.push(`${name}: not an object`); continue; }
    const type = String(ctl.type ?? '').toLowerCase();
    if (!LIVELY_TYPES.has(type)) { problems.push(`${name}: missing/unsupported "type" (${JSON.stringify(ctl.type)})`); continue; }
    for (const f of REQUIRED[type] || []) if (!(f in ctl)) problems.push(`${name}: ${type} is missing "${f}"`);
    if (type === 'slider' && (ctl.value < ctl.min || ctl.value > ctl.max)) problems.push(`${name}: value outside min/max`);
    if (type === 'dropdown' && (ctl.value < 0 || ctl.value >= (ctl.items || []).length)) problems.push(`${name}: dropdown value out of range`);
    if (type === 'color' && !/^#[0-9a-fA-F]{6}$/.test(ctl.value)) problems.push(`${name}: color must be #RRGGBB`);
    if (type !== 'label' && !engine.includes(`case '${name}':`)) problems.push(`${name}: no "case '${name}':" in livelyPropertyListener (src/engine.js)`);
  }

  for (const f of ['src/engine.js', 'src/rocket-data.js', 'web/shell.js']) {
    try { new vm.Script(read(f), { filename: f }); } catch (e) { problems.push(`${f}: syntax error: ${e.message}`); }
  }

  try {
    const info = JSON.parse(read('wallpaper/LivelyInfo.json'));
    if (info.Type !== 1) problems.push('LivelyInfo.json: Type should be 1 (web wallpaper)');
    if (info.FileName !== 'index.html') problems.push('LivelyInfo.json: FileName should be index.html');
    for (const k of ['Thumbnail', 'Preview']) if (info[k] && !existsSync(join(root, 'wallpaper', info[k]))) problems.push(`LivelyInfo.json: ${k} file "${info[k]}" not found in wallpaper/`);
    if (!/--pause-event true/.test(info.Arguments || '')) problems.push('LivelyInfo.json: Arguments should include "--pause-event true"');
  } catch (e) { problems.push('wallpaper/LivelyInfo.json is not valid JSON: ' + e.message); }

  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = validate(root);
  if (problems.length) { console.error('✗ ' + problems.length + ' problem(s):\n  - ' + problems.join('\n  - ')); process.exit(1); }
  console.log('✓ validation passed');
}
