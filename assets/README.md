# App icon & splash source art

`@capacitor/assets` reads the source art in this folder and generates every
icon/splash size for the Android (and later iOS) projects. The per-app
background colors are passed as flags by the `icons:patient` / `icons:phleb`
npm scripts, so you only need to supply the **foreground mark** once.

## Drop these files here

| File | Size | Notes |
|------|------|-------|
| `icon-foreground.png` | 1024×1024 | The ConveLabs **blood-drop mark only** (no tagline), centered, **transparent background**. Keep the mark within the middle ~66% — Android's adaptive icon crops the edges. |
| `splash.png` | 2732×2732 | Logo centered on transparent, lots of empty margin. |
| `splash-dark.png` | 2732×2732 | *(optional)* dark-mode splash. |

If you only have the white-background logo with the tagline, save it as
`icon-only.png` (1024×1024, square) instead — it'll still work, just without
the per-app background-color trick.

## Then generate

```
npm run icons:patient   # ConveLabs        → drop on WHITE  background
npm run icons:phleb     # ConveLabs Pro    → drop on DARK-RED (#7F1D1D) background
```

Run `npm run cap:patient` (or `cap:phleb`) afterward to re-sync, then build.
The two apps are deliberately given different icon backgrounds so they're
easy to tell apart on a phone home screen.
