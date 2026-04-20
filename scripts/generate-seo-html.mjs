#!/usr/bin/env node
/**
 * generate-seo-html.mjs — Post-build SEO fix
 *
 * Problem: Vite produces ONE index.html for the whole SPA. Every route
 * (including /locations/winter-park) serves that same HTML initially,
 * which means Googlebot's first-pass crawl sees the HOMEPAGE canonical
 * on every location page — effectively self-de-indexing all our
 * location pages.
 *
 * Fix: After `vite build`, read the canonical locations.ts data and
 * generate a per-route dist/<path>/index.html with the right title,
 * description, canonical, and OG tags baked in. React hydrates on top
 * and the user still gets the same experience — but the pre-hydration
 * HTML Google sees is correct per route.
 *
 * Usage: Auto-run via package.json "build" script (see postbuild).
 *
 * This is lightweight SSG targeted only at SEO-critical pages:
 *   - All /locations/<slug> routes
 *   - (Extend later to /pricing, /partner-with-us, /guarantee, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INDEX_HTML = path.join(DIST, 'index.html');
const LOCATIONS_SRC = path.join(ROOT, 'src', 'data', 'locations.ts');

function die(msg) { console.error(`[generate-seo-html] ${msg}`); process.exit(1); }

if (!fs.existsSync(DIST)) die(`dist/ not found — run 'vite build' first`);
if (!fs.existsSync(INDEX_HTML)) die(`dist/index.html missing`);

// Poor-man's parser: read locations.ts as text and extract seo blocks.
// Works because locations.ts is a pure data file (no imports needed for
// values). Keeps this script dependency-free.
const locationsSrc = fs.readFileSync(LOCATIONS_SRC, 'utf-8');

// Match each location block: `"slug-or-ident": { ... }`
// We extract the slug from the key and the seo {} block by matching
// balanced braces (simple brace counter from the start of seo: {).
function extractLocations(src) {
  const out = [];
  // Find every `slug: "xxx"` within a location block — each location has a slug field
  const slugRe = /slug:\s*["'`]([^"'`]+)["'`]/g;
  const titleRe = /title:\s*["'`]([^"'`]+)["'`]/;
  const descRe = /description:\s*["'`]([^"'`]+)["'`]/;
  const canonicalRe = /canonicalPath:\s*["'`]([^"'`]+)["'`]/;
  const nameRe = /name:\s*["'`]([^"'`]+)["'`]/;
  const heroTitleRe = /heroTitle:\s*["'`]([^"'`]+)["'`]/;
  const heroDescRe = /heroDescription:\s*["'`]([^"'`]+)["'`]/;
  const ogImageRe = /ogImage:\s*["'`]([^"'`]+)["'`]/;
  const latRe = /latitude:\s*([\-\d.]+)/;
  const lonRe = /longitude:\s*([\-\d.]+)/;
  const zipRe = /postalCode:\s*["'`]([^"'`]+)["'`]/;

  // Walk the source by finding each top-level `slug:` occurrence. The block
  // starts at the nearest `{` before it and ends at the matching `}`.
  let match;
  while ((match = slugRe.exec(src)) !== null) {
    const slug = match[1];
    // Find the opening { of this location object (walk backward)
    let i = match.index;
    while (i >= 0 && src[i] !== '{') i--;
    if (i < 0) continue;
    // Find the matching closing }
    let depth = 1;
    let j = i + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const block = src.slice(i, j);

    const seo = {
      slug,
      name: nameRe.exec(block)?.[1] || slug,
      title: titleRe.exec(block)?.[1],
      description: descRe.exec(block)?.[1],
      canonicalPath: canonicalRe.exec(block)?.[1] || `/locations/${slug}`,
      heroTitle: heroTitleRe.exec(block)?.[1],
      heroDescription: heroDescRe.exec(block)?.[1],
      ogImage: ogImageRe.exec(block)?.[1],
      latitude: parseFloat(latRe.exec(block)?.[1] || '0'),
      longitude: parseFloat(lonRe.exec(block)?.[1] || '0'),
      postalCode: zipRe.exec(block)?.[1],
    };
    if (seo.title && seo.description) out.push(seo);
  }
  return out;
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMetaForRoute(loc) {
  // Always canonicalize to /locations/<slug> — that's the real React route.
  // Some legacy canonicalPath values are bare (e.g. /orlando) due to redirect
  // routes, but the authoritative URL is /locations/<slug>.
  const canonical = `https://www.convelabs.com/locations/${loc.slug}`;
  const ogImage = loc.ogImage || 'https://www.convelabs.com/og-image-v2.png';
  // LocalBusiness schema per location — crucial for local SEO
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'MedicalBusiness',
    name: `ConveLabs — Mobile Phlebotomy ${loc.name}`,
    image: ogImage,
    url: canonical,
    telephone: '+1-941-527-9169',
    email: 'info@convelabs.com',
    description: loc.description,
    address: {
      '@type': 'PostalAddress',
      addressLocality: loc.name,
      addressRegion: 'FL',
      postalCode: loc.postalCode,
      addressCountry: 'US',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: loc.latitude,
      longitude: loc.longitude,
    },
    areaServed: {
      '@type': 'City',
      name: loc.name,
    },
    priceRange: '$$$',
    openingHours: 'Mo-Sa 06:00-20:00',
  };

  return {
    title: loc.title,
    description: loc.description,
    canonical,
    ogImage,
    schemaJson: JSON.stringify(schema, null, 2),
  };
}

/**
 * Rewrite Vite's index.html for a specific route by replacing the
 * <title>, <meta description>, <link canonical>, and og:* tags.
 * Appends a per-route <script type="application/ld+json"> before </head>.
 */
function rewriteHtmlForRoute(baseHtml, meta) {
  let html = baseHtml;

  // <title>
  html = html.replace(/<title>[^<]*<\/title>/i,
    `<title>${escapeHtmlAttr(meta.title)}</title>`);

  // <meta name="description">
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtmlAttr(meta.description)}" />`);

  // <link canonical>
  if (/<link rel="canonical"/i.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${escapeHtmlAttr(meta.canonical)}" />`);
  } else {
    html = html.replace('</head>',
      `  <link rel="canonical" href="${escapeHtmlAttr(meta.canonical)}" />\n</head>`);
  }

  // og:title / og:description / og:url
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:url" content="${escapeHtmlAttr(meta.canonical)}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/gi,
    `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/gi,
    `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}" />`);

  // og:image — keep brand image but fix the stale 'luxury' alt text
  html = html.replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/i,
    `<meta property="og:image:alt" content="${escapeHtmlAttr('ConveLabs — Concierge mobile lab services at your door. Licensed, fast, private.')}" />`);

  // Append LocalBusiness JSON-LD right before </head>
  const schemaTag = `  <script type="application/ld+json" data-generated="per-route">\n${meta.schemaJson}\n  </script>\n`;
  html = html.replace('</head>', `${schemaTag}</head>`);

  return html;
}

/**
 * Write the given HTML to dist/<path>/index.html (creating dirs as needed).
 */
function writeRouteIndex(routePath, html) {
  // routePath like '/locations/winter-park' → dist/locations/winter-park/index.html
  const rel = routePath.replace(/^\/+/, '');
  const targetDir = path.join(DIST, rel);
  fs.mkdirSync(targetDir, { recursive: true });
  const targetFile = path.join(targetDir, 'index.html');
  fs.writeFileSync(targetFile, html, 'utf-8');
  return path.relative(ROOT, targetFile);
}

// ── MAIN ─────────────────────────────────────────────────────────
console.log('[generate-seo-html] Reading dist/index.html…');
const baseHtml = fs.readFileSync(INDEX_HTML, 'utf-8');

console.log('[generate-seo-html] Parsing locations from src/data/locations.ts…');
const locations = extractLocations(locationsSrc);
console.log(`[generate-seo-html] Found ${locations.length} locations with SEO metadata.`);

// Also fix the og:image:alt on the ROOT index.html (stale 'luxury' word)
const rootHtml = baseHtml.replace(
  /<meta property="og:image:alt" content="ConveLabs — Luxury mobile lab services[^"]*"\s*\/?>/i,
  `<meta property="og:image:alt" content="ConveLabs — Concierge mobile lab services at your door. Licensed, fast, private." />`
);
if (rootHtml !== baseHtml) {
  fs.writeFileSync(INDEX_HTML, rootHtml, 'utf-8');
  console.log(`[generate-seo-html] ✔ Rewrote dist/index.html (removed stale 'luxury' og:image:alt)`);
}

let wroteCount = 0;
for (const loc of locations) {
  const meta = renderMetaForRoute(loc);
  const html = rewriteHtmlForRoute(rootHtml, meta);
  // Canonical path could be /locations/<slug> or legacy /<slug>
  const written = writeRouteIndex(meta.canonical.replace('https://www.convelabs.com', ''), html);
  console.log(`  ✔ ${loc.slug.padEnd(22)} → ${written}`);
  wroteCount++;
}

console.log(`[generate-seo-html] Done. ${wroteCount} per-route index.html files generated.`);
