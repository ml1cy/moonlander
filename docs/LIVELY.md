# Lively Wallpaper notes

Docs: <https://github.com/rocksdanister/lively/wiki/Web-Guide-IV-:-Interaction>
Parser source of truth: `Lively.Common/JsonConverters/LivelyControlModelConverter.cs` in <https://github.com/rocksdanister/lively>.

## Package

The zip must have `LivelyInfo.json` at its root (the build does this). Users install by dragging the zip into Lively.

`LivelyInfo.json`: `Type: 1` (web), `FileName: "index.html"`, `Arguments: "--pause-event true"` (so Lively calls `livelyWallpaperPlaybackChanged` and the engine fully stops when paused), `Thumbnail`, `Preview`.

## LivelyProperties.json control shapes

Every entry **must** have `"type"` — Lively throws `Control type '' is not supported` for the whole panel otherwise. Accepted types (case-insensitive): `slider, textbox, dropdown, folderDropdown, scalerDropdown, button, color, checkbox, label`.

```jsonc
"name":  { "type": "slider",   "text": "Label", "min": 0, "max": 100, "step": 1, "value": 50, "help": "optional" }
"name":  { "type": "checkbox", "text": "Label", "value": true }
"name":  { "type": "color",    "text": "Label", "value": "#RRGGBB" }
"name":  { "type": "dropdown", "text": "Label", "value": 0, "items": ["A", "B"] }   // value = index
"name":  { "type": "button",   "text": "Label", "value": "Button caption" }
"name":  { "type": "label",    "value": "Section title" }
```

Lively calls `livelyPropertyListener(name, value)` once per control on load (not for buttons/labels) and again on every change. Buttons send `(name, value)` when clicked.

## Things to tell users after an update

- **Delete the old wallpaper from the library and re-import the new zip.** Lively keeps a per-install copy of LivelyProperties.json in `SaveData/wpdata/<folder>/`; it is only created when missing, so new or fixed controls won't appear for an existing install. "Restore Default" doesn't refresh it from a new package.
- Keyboard play needs **Lively → Settings → Wallpaper → Interaction → Wallpaper Input → Keyboard**, and the desktop must have focus (click an empty spot).
- Mouse input reaches the wallpaper only on empty desktop, not over icons; Windows may draw its selection rectangle while dragging the rocket.

## Testing without Lively

`npm test` loads `dist/wallpaper/index.html`, feeds every property through `livelyPropertyListener` like Lively does, and toggles `livelyWallpaperPlaybackChanged`. It can't catch Lively-only problems (input forwarding, per-install property copies), so changes to `LivelyProperties.json` also rely on `npm run validate`.

## Regenerating thumbnail.jpg / preview.gif

The preview must be exactly one idle period so it loops cleanly in Lively's library. See docs/TESTING.md → "Preview GIF".
