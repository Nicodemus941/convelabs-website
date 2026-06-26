// Flip the native Android project between the two ConveLabs apps before a
// build. capacitor.config.json (the runtime config) is handled by `cap sync`
// via CAP_TARGET, but the *store identity* lives in the committed native
// files and `cap sync` never rewrites it — so we do it here.
//
//   node scripts/set-cap-target.mjs patient   -> com.convelabs.patient / "ConveLabs"
//   node scripts/set-cap-target.mjs phleb     -> com.convelabs.phleb  / "ConveLabs Pro"
//
// We change ONLY applicationId (the published id) + the display-name strings.
// The Kotlin/Java `namespace`/package stays com.convelabs.patient because it's
// internal (R/BuildConfig) and decoupling it from applicationId is standard
// Gradle. Default committed state is the patient app.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const APPS = {
  patient: { appId: 'com.convelabs.patient', appName: 'ConveLabs' },
  phleb: { appId: 'com.convelabs.phleb', appName: 'ConveLabs Pro' },
};

const target = process.argv[2];
const app = APPS[target];
if (!app) {
  console.error(`Unknown target "${target}". Use: patient | phleb`);
  process.exit(1);
}

function rewrite(relPath, replacers) {
  const p = resolve(root, relPath);
  if (!existsSync(p)) {
    console.warn(`[set-cap-target] skip (not found): ${relPath}`);
    return;
  }
  let text = readFileSync(p, 'utf8');
  for (const [re, val] of replacers) text = text.replace(re, val);
  writeFileSync(p, text);
  console.log(`[set-cap-target] ${relPath} -> ${target}`);
}

// Android applicationId
rewrite('android/app/build.gradle', [
  [/applicationId\s+"[^"]*"/, `applicationId "${app.appId}"`],
]);

// Android display name + launcher activity label
rewrite('android/app/src/main/res/values/strings.xml', [
  [/(<string name="app_name">)[^<]*(<\/string>)/, `$1${app.appName}$2`],
  [/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${app.appName}$2`],
]);

console.log(`[set-cap-target] done: ${app.appName} (${app.appId})`);
