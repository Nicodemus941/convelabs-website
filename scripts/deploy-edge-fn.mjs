// Deploy one or more Supabase edge functions via the Management API, bundling
// each function's entrypoint + all of its relative (`./` and `../_shared/...`)
// imports. This is the reliable path on this machine because the Supabase CLI
// binary is quarantined by McAfee, and large/dep-heavy functions (stripe-webhook,
// anything importing the _shared/email barrel) can't be hand-pasted through the
// MCP deploy tool.
//
// Usage:
//   node scripts/deploy-edge-fn.mjs add-companion stripe-webhook send-appointment-reminder
//
// Token: reads a Supabase personal access token from C:/tmp/.sbtoken (or the
// SUPABASE_ACCESS_TOKEN env var). verify_jwt is read from supabase/config.toml
// per function (defaults to false to match the cron/webhook/public pattern).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_REF = 'yluyonhrxxtyuiyrdixl';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FN_ROOT = resolve(ROOT, 'supabase/functions');

const token = (process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync('C:/tmp/.sbtoken') ? readFileSync('C:/tmp/.sbtoken', 'utf8') : '')).trim();
if (!token) { console.error('No token. Put it in C:/tmp/.sbtoken or SUPABASE_ACCESS_TOKEN.'); process.exit(1); }

const slugs = process.argv.slice(2);
if (slugs.length === 0) { console.error('Pass at least one function slug.'); process.exit(1); }

// verify_jwt from config.toml ([functions.<slug>] verify_jwt = ...), default false.
function verifyJwtFor(slug) {
  const cfgPath = resolve(ROOT, 'supabase/config.toml');
  if (!existsSync(cfgPath)) return false;
  const cfg = readFileSync(cfgPath, 'utf8');
  const m = cfg.match(new RegExp(`\\[functions\\.${slug.replace(/[-.]/g, '\\$&')}\\][\\s\\S]*?verify_jwt\\s*=\\s*(true|false)`));
  return m ? m[1] === 'true' : false;
}

// Recursively collect a file + its relative imports. Keys = path relative to FN_ROOT.
function collect(entryAbs, acc = new Map()) {
  const rel = relative(FN_ROOT, entryAbs).replace(/\\/g, '/');
  if (acc.has(rel)) return acc;
  const src = readFileSync(entryAbs, 'utf8');
  acc.set(rel, src);
  const importRe = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let mm;
  while ((mm = importRe.exec(src)) !== null) {
    const spec = mm[1] || mm[2];
    if (!spec) continue;
    let dep = resolve(dirname(entryAbs), spec);
    if (!existsSync(dep)) {
      if (existsSync(dep + '.ts')) dep += '.ts';
      else if (existsSync(resolve(dep, 'index.ts'))) dep = resolve(dep, 'index.ts');
      else { console.warn(`  ! unresolved import ${spec} in ${rel}`); continue; }
    }
    collect(dep, acc);
  }
  return acc;
}

async function deploy(slug) {
  const entry = resolve(FN_ROOT, slug, 'index.ts');
  if (!existsSync(entry)) { console.error(`  ✗ ${slug}: no index.ts`); return false; }
  const files = collect(entry);
  const verify_jwt = verifyJwtFor(slug);
  const entrypoint_path = `${slug}/index.ts`;

  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify({ name: slug, entrypoint_path, verify_jwt })], { type: 'application/json' }));
  for (const [rel, content] of files) {
    fd.append(rel, new Blob([content], { type: 'application/typescript' }), rel);
  }

  console.log(`Deploying ${slug} (verify_jwt=${verify_jwt}, ${files.size} file(s)): ${[...files.keys()].join(', ')}`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${slug}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  const body = await res.text();
  if (!res.ok) { console.error(`  ✗ ${slug}: ${res.status} ${body}`); return false; }
  let v = '?'; try { v = JSON.parse(body).version; } catch {}
  console.log(`  ✓ ${slug} deployed (version ${v})`);
  return true;
}

let ok = true;
for (const slug of slugs) { ok = (await deploy(slug)) && ok; }
process.exit(ok ? 0 : 1);
