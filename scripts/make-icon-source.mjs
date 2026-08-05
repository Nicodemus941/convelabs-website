// One-off: build the @capacitor/assets source art (assets/icon-only.png +
// assets/splash.png) from the ConveLabs brand logo in public/. We only have
// the white-background logo (with tagline), so per assets/README.md it becomes
// `icon-only.png` (1024×1024 square). The splash is the same mark centered on
// white with generous margin. Run: `node scripts/make-icon-source.mjs`.
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'public', 'favicon-512.png'); // full ConveLabs logo, white bg
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// App icon — 1024×1024, logo on white, small safe margin so the mark isn't
// jammed to the edges of the rounded iOS/Android tile.
const ICON = 1024;
const iconInner = Math.round(ICON * 0.86);
const iconLogo = await sharp(SRC)
  .resize(iconInner, iconInner, { fit: 'contain', background: WHITE, kernel: 'lanczos3' })
  .toBuffer();
await sharp({ create: { width: ICON, height: ICON, channels: 4, background: WHITE } })
  .composite([{ input: iconLogo, gravity: 'center' }])
  .png()
  .toFile(join(root, 'assets', 'icon-only.png'));

// Splash — 2732×2732, logo centered small with lots of empty margin (Capacitor
// crops the splash heavily on smaller screens).
const SPLASH = 2732;
const splashInner = Math.round(SPLASH * 0.34);
const splashLogo = await sharp(SRC)
  .resize(splashInner, splashInner, { fit: 'contain', background: WHITE, kernel: 'lanczos3' })
  .toBuffer();
await sharp({ create: { width: SPLASH, height: SPLASH, channels: 4, background: WHITE } })
  .composite([{ input: splashLogo, gravity: 'center' }])
  .png()
  .toFile(join(root, 'assets', 'splash.png'));

console.log('Wrote assets/icon-only.png (1024) + assets/splash.png (2732)');
