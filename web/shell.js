/*
 * Browser-game shell around the shared engine (src/engine.js).
 *
 * - Title screen over the engine's idle loop (attract mode); Play hands the ship to the player.
 * - Pause (Esc / P), which freezes the engine.
 * - Settings drawer generated from settings.json — the SAME schema as the wallpaper's
 *   LivelyProperties.json (copied there by scripts/build.mjs). Values are saved in
 *   localStorage and fed to the engine through window.livelyPropertyListener, exactly
 *   like Lively does, so a new setting only needs adding once.
 * - On-screen buttons for touch devices.
 */
'use strict';

(function () {
  const ML = window.MoonLander;
  const $ = id => document.getElementById(id);
  const SETTINGS_KEY = 'moonLander.settings.v1';

  // Settings whose wallpaper default doesn't suit the game, and help text that mentions Lively.
  const WEB_DEFAULTS = { autopilot: false };
  const WEB_HIDE = new Set([]);
  const HELP_OVERRIDE = {
    keyboardControl: 'Arrow keys / WASD fly, Space fires, H toggles autopilot, Tab opens upgrades.',
    autopilot: 'When on, autopilot flies the ship home after it has been left alone. H toggles it.'
  };

  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (isTouch) document.body.classList.add('touch');
  $('version').textContent = 'Moon Lander v' + (ML.version || 'dev');

  // ---------------------------------------------------------------- settings
  let schema = {};
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { saved = {}; }

  const defaultOf = (name, ctl) => (name in WEB_DEFAULTS ? WEB_DEFAULTS[name] : ctl.value);
  const valueOf = (name, ctl) => (name in saved ? saved[name] : defaultOf(name, ctl));

  function persist() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch (e) { /* private mode etc. */ }
  }
  function setValue(name, value) {
    saved[name] = value;
    persist();
    ML.setProperty(name, value);
  }

  function row(labelText, help) {
    const r = document.createElement('div');
    r.className = 'set-row';
    const l = document.createElement('label');
    l.textContent = labelText;
    r.appendChild(l);
    return { r, l, addHelp() { if (help) { const h = document.createElement('div'); h.className = 'help'; h.textContent = help; r.appendChild(h); } } };
  }

  function buildSettingsUI() {
    const body = $('settingsBody');
    body.textContent = '';
    for (const [name, ctl] of Object.entries(schema)) {
      if (WEB_HIDE.has(name)) continue;
      const help = HELP_OVERRIDE[name] ?? ctl.help;
      const id = 'set-' + name;
      const type = String(ctl.type).toLowerCase();
      if (type === 'label') {
        const h = document.createElement('div');
        h.className = 'set-label';
        h.textContent = ctl.value;
        body.appendChild(h);
        continue;
      }
      const { r, l, addHelp } = row(ctl.text || name, help);
      l.htmlFor = id;
      let input;
      const v = valueOf(name, ctl);
      if (type === 'slider') {
        const out = document.createElement('span');
        out.className = 'val';
        out.textContent = v;
        input = document.createElement('input');
        Object.assign(input, { type: 'range', min: ctl.min, max: ctl.max, step: ctl.step || 1, value: v });
        input.addEventListener('input', () => { out.textContent = input.value; setValue(name, Number(input.value)); });
        r.appendChild(out);
      } else if (type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!v;
        input.addEventListener('change', () => setValue(name, input.checked));
      } else if (type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = String(v).toLowerCase();
        input.addEventListener('input', () => setValue(name, input.value.toUpperCase()));
      } else if (type === 'dropdown') {
        input = document.createElement('select');
        (ctl.items || []).forEach((txt, i) => { const o = document.createElement('option'); o.value = i; o.textContent = txt; input.appendChild(o); });
        input.value = v;
        input.addEventListener('change', () => setValue(name, Number(input.value)));
      } else if (type === 'button') {
        input = document.createElement('button');
        input.type = 'button';
        input.textContent = ctl.value;
        input.addEventListener('click', () => {
          if (name === 'resetProgress' && !confirmReset()) return;
          ML.setProperty(name, ctl.value);
        });
      } else continue;   // textbox/folderDropdown aren't used
      input.id = id;
      r.appendChild(input);
      addHelp();
      body.appendChild(r);
    }
  }

  let resetArmed = 0;
  function confirmReset() {
    // two clicks within 3 s instead of a blocking confirm() dialog
    const now = Date.now();
    if (now - resetArmed < 3000) { resetArmed = 0; return true; }
    resetArmed = now;
    const b = $('set-resetProgress');
    if (b) { const t = b.textContent; b.textContent = 'Click again to confirm'; setTimeout(() => { b.textContent = t; }, 3000); }
    return false;
  }

  function applyAll() {
    for (const [name, ctl] of Object.entries(schema)) {
      const type = String(ctl.type).toLowerCase();
      if (type === 'label' || type === 'button') continue;
      ML.setProperty(name, valueOf(name, ctl));
    }
  }

  fetch('settings.json')
    .then(r => r.json())
    .then(json => { schema = json; applyAll(); buildSettingsUI(); })
    .catch(() => { /* engine defaults still work */ });

  $('resetSettings').addEventListener('click', () => {
    saved = {};
    persist();
    applyAll();
    buildSettingsUI();
  });

  // ---------------------------------------------------------------- screens
  let playing = false;
  const settingsOpen = () => !$('settings').classList.contains('hidden');

  function start() {
    if (playing) return;
    playing = true;
    $('title').classList.add('hidden');
    document.body.classList.add('playing');
    if (isTouch) $('touch').classList.remove('hidden');
    ML.takeControl();
  }

  function setPause(p) {
    if (!playing) return;
    ML.pause(p);
    $('pause').classList.toggle('hidden', !p);
  }

  function openSettings(open) {
    $('settings').classList.toggle('hidden', !open);
    if (open && playing && !ML.paused) setPause(true);
  }

  // A clicked button keeps keyboard focus; drop it so Space/arrows/Tab go to the game
  // instead of re-pressing the (possibly now hidden) button.
  document.addEventListener('click', e => { if (e.target.closest('button')) e.target.closest('button').blur(); });

  $('play').addEventListener('click', start);
  $('resume').addEventListener('click', () => setPause(false));
  $('pauseSettings').addEventListener('click', () => openSettings(true));
  $('gear').addEventListener('click', () => openSettings(!settingsOpen()));
  $('closeSettings').addEventListener('click', () => openSettings(false));

  // Capture phase so the shell sees keys before the engine does.
  window.addEventListener('keydown', e => {
    const inField = e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (!playing) {
      if (inField || settingsOpen()) return;
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); start(); }
      return;
    }
    if ((e.code === 'Escape' || e.code === 'KeyP') && !ML.menuOpen && !inField) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (settingsOpen()) openSettings(false);
      else setPause(!ML.paused);
      return;
    }
    if (ML.paused) { e.stopImmediatePropagation(); }   // nothing reaches the engine while paused
  }, true);

  // Pause automatically when the tab is hidden.
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing && !ML.paused) setPause(true); });

  // ---------------------------------------------------------------- touch buttons
  for (const b of document.querySelectorAll('#touch button')) {
    const key = b.dataset.key, action = b.dataset.action;
    const down = e => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      b.classList.add('on');
      if (key) ML.key(key, true);
      else if (action === 'menu') ML.toggleMenu();
      else if (action === 'autopilot') ML.toggleAutopilot();
    };
    const up = e => {
      e.preventDefault();
      b.classList.remove('on');
      if (key) ML.key(key, false);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
})();
