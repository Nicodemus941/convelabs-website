/**
 * publish-ota.mjs — package the built web bundle (dist/) and register it as an
 * OTA update for a ConveLabs native app. Runs in the Codemagic `*-web-ota`
 * lane (or locally) AFTER `npm run build`.
 *
 * Steps: zip dist (index.html at zip ROOT) -> sha256 -> upload to the public
 * `app-bundles` bucket -> insert an active row in app_ota_bundles. The
 * app-ota-check edge fn then serves it to installed apps.
 *
 * Env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (required to publish)
 *   OTA_APP_ID          com.convelabs.phleb | com.convelabs.patient  (required)
 *   OTA_PLATFORM        ios | android | all   (default: all)
 *   OTA_CHANNEL         default: production
 *   OTA_MIN_NATIVE_BUILD default: 0  (bump to the native build that first
 *                        embeds a plugin an OTA bundle needs)
 *   OTA_VERSION         default: 1.0.<unix-seconds>  (MUST be semver — Capgo
 *                        SILENTLY SKIPS a version it can't parse as semver)
 *
 * GRACEFUL GATE: if SUPABASE_SERVICE_ROLE_KEY is empty this exits 0 (build-only,
 * no publish, no hard fail) so the CI lane never breaks a build before the
 * secret is wired.
 */
import { createClient } from '@supabase/supabase-js';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APP_ID = process.env.OTA_APP_ID || '';
const PLATFORM = (process.env.OTA_PLATFORM || 'all').toLowerCase();
const CHANNEL = process.env.OTA_CHANNEL || 'production';
const MIN_NATIVE_BUILD = parseInt(process.env.OTA_MIN_NATIVE_BUILD || '0', 10) || 0;
// Monotonic semver default. A git hash or `b<ts>` is NOT valid semver and Capgo
// silently drops it — see the GHS post-mortem. Keep this semver.
const VERSION = process.env.OTA_VERSION || `1.0.${Math.floor(Date.now() / 1000)}`;

function fail(msg) { console.error(`[publish-ota] ${msg}`); process.exit(1); }

// Graceful build-only gate.
if (!SERVICE_KEY) {
  console.log('[publish-ota] SUPABASE_SERVICE_ROLE_KEY empty — skipping publish (build-only). exit 0');
  process.exit(0);
}
if (!SUPABASE_URL) fail('SUPABASE_URL is required');
if (!APP_ID) fail('OTA_APP_ID is required (com.convelabs.phleb | com.convelabs.patient)');
if (!existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html not found — run `npm run build` first');

const zip = new AdmZip();
// addLocalFolder puts dist's CONTENTS at the zip root (index.html at root),
// using forward-slash paths on every OS (adm-zip is pure JS — avoids the
// Windows `zip`/Compress-Archive backslash bug).
zip.addLocalFolder(DIST);
const buf = zip.toBuffer();
const checksum = crypto.createHash('sha256').update(buf).digest('hex');
const storagePath = `${APP_ID}/${CHANNEL}/${VERSION}.zip`;

console.log(`[publish-ota] app=${APP_ID} platform=${PLATFORM} channel=${CHANNEL} version=${VERSION} min_native_build=${MIN_NATIVE_BUILD} bytes=${buf.length} sha256=${checksum.slice(0, 16)}…`);

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const up = await admin.storage.from('app-bundles').upload(storagePath, buf, {
  contentType: 'application/zip',
  upsert: true,
});
if (up.error) fail(`upload failed: ${up.error.message}`);

const ins = await admin.from('app_ota_bundles').insert({
  app_id: APP_ID,
  platform: PLATFORM,
  channel: CHANNEL,
  version: VERSION,
  storage_path: storagePath,
  checksum,
  min_native_build: MIN_NATIVE_BUILD,
  is_active: true,
}).select('id').single();
if (ins.error) fail(`registry insert failed: ${ins.error.message}`);

console.log(`[publish-ota] published bundle ${ins.data.id} (version ${VERSION}). Installed ${APP_ID} apps will pick it up on next cold start.`);
