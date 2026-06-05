#!/usr/bin/env node
/**
 * generate-seo-html.mjs — Post-build SEO prerender (lightweight SSG)
 *
 * Problem: Vite produces ONE index.html for the whole SPA. Every route
 * serves that same shell initially, which means Googlebot's first-pass
 * crawl sees the HOMEPAGE <title>, <meta description>, and canonical on
 * EVERY page — effectively self-de-indexing every non-home route
 * (location pages, /pricing, /membership, the blog, etc.).
 *
 * Fix: After `vite build`, write a per-route dist/<path>/index.html with
 * the correct title, description, canonical, OG/Twitter tags, and (where
 * relevant) JSON-LD baked in. Vercel serves these static files BEFORE the
 * catch-all `/(.*) -> /index.html` rewrite (filesystem precedes rewrites),
 * so Google gets correct pre-hydration HTML. React hydrates on top and the
 * user experience is unchanged.
 *
 * Coverage:
 *   1. All /locations/<slug> routes        (parsed from src/data/locations.ts)
 *   2. Curated static marketing routes      (STATIC_ROUTES below)
 *   3. Every blog post /blog/<slug>          (parsed from src/data/blogPosts.ts)
 *
 * Usage: auto-run via package.json "build" script.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INDEX_HTML = path.join(DIST, 'index.html');
const LOCATIONS_SRC = path.join(ROOT, 'src', 'data', 'locations.ts');
const BLOG_SRC = path.join(ROOT, 'src', 'data', 'blogPosts.ts');
const ORIGIN = 'https://www.convelabs.com';
const DEFAULT_OG = `${ORIGIN}/og-image-v2.png`;

function die(msg) { console.error(`[generate-seo-html] ${msg}`); process.exit(1); }

if (!fs.existsSync(DIST)) die(`dist/ not found — run 'vite build' first`);
if (!fs.existsSync(INDEX_HTML)) die(`dist/index.html missing`);

// ── Curated static marketing routes ──────────────────────────────
// Single source of truth for the SEO title + meta on each indexable
// marketing page. Titles kept <=60 chars, descriptions <=160 chars.
const STATIC_ROUTES = [
  { path: '/pricing',
    title: 'Mobile Phlebotomy Pricing — ConveLabs Orlando',
    description: 'Transparent mobile phlebotomy pricing across Central Florida. Flat visit fees, no surprise bills, member savings. See what an at-home blood draw costs.' },
  { path: '/membership',
    title: 'Lab Membership Plans | Save on Every Draw — ConveLabs',
    description: 'ConveLabs membership: discounted mobile blood draws, priority scheduling, and family coverage across Central Florida. Annual plans that pay for themselves.' },
  { path: '/membership/individual',
    title: 'Individual Lab Membership — ConveLabs',
    description: 'An individual ConveLabs membership: member pricing on every at-home blood draw, priority booking, and a locked rate across Central Florida.' },
  { path: '/membership/family',
    title: 'Family Lab Membership — ConveLabs',
    description: 'Cover your whole household with a ConveLabs family membership: member-rate mobile blood draws and priority scheduling for everyone in Central Florida.' },
  { path: '/concierge-phlebotomy',
    title: 'Concierge Mobile Phlebotomy Orlando — ConveLabs',
    description: 'White-glove concierge blood draws for executives and busy professionals in Central Florida. Discreet, on-time, licensed phlebotomists at your door or office.' },
  { path: '/lab-testing',
    title: 'At-Home Lab Testing Central Florida — ConveLabs',
    description: 'Order at-home lab testing across Central Florida. Licensed mobile phlebotomists collect your sample; results in 48 hours. Quest & Labcorp compatible.' },
  { path: '/vs-labcorp',
    title: 'ConveLabs vs Labcorp: At-Home Blood Draw Compared',
    description: "Skip the Labcorp waiting room. Compare ConveLabs mobile phlebotomy vs Labcorp on convenience, speed, and one-try draws at your door in Central Florida." },
  { path: '/mobile-phlebotomy-cost',
    title: 'Mobile Phlebotomy Cost in Central Florida (2026) — ConveLabs',
    description: 'How much does an at-home blood draw cost in Central Florida? A clear 2026 breakdown of mobile phlebotomy fees, travel surcharges, insurance, and ways to save.' },
  { path: '/guarantee',
    title: 'On-Time Guarantee | Mobile Blood Draw — ConveLabs',
    description: "ConveLabs guarantees on-time arrival, licensed phlebotomists, delivery confirmation, and a free re-draw if you're not satisfied — or your visit is free." },
  { path: '/nationwide-mobile-phlebotomy-network',
    title: 'Nationwide Mobile Phlebotomy Network — ConveLabs',
    description: 'Need a mobile phlebotomist outside Central Florida? ConveLabs connects you with vetted at-home blood draw providers across the United States.' },
  { path: '/partner-with-us',
    title: 'Partner With ConveLabs | For Clinics & Practices',
    description: 'Refer patient draws to ConveLabs. We handle mobile collection, lab routing, and specimen delivery for clinics and concierge practices in Central Florida.' },
  { path: '/b2b',
    title: 'Mobile Phlebotomy for Practices — ConveLabs B2B',
    description: 'ConveLabs for healthcare practices: order patient blood draws, track specimens, get delivery receipts. Org-billed, HIPAA-compliant mobile phlebotomy.' },
  { path: '/corporate',
    title: 'Corporate Wellness Blood Draws — ConveLabs',
    description: 'On-site corporate wellness blood draws across Central Florida. Licensed phlebotomists come to your office for employee biometric screening and lab work.' },
  { path: '/about',
    title: 'About ConveLabs | Mobile Phlebotomy Central Florida',
    description: 'ConveLabs brings licensed, hospital-grade mobile phlebotomy to Central Florida homes and offices. Learn our story, our standards, and our on-time guarantee.' },
  { path: '/contact',
    title: 'Contact ConveLabs | Mobile Blood Draw Orlando',
    description: 'Questions or booking help? Contact ConveLabs for mobile phlebotomy across Central Florida. Call (941) 527-9169 or message us — same-day visits available.' },
  { path: '/faq',
    title: 'Mobile Phlebotomy FAQ — ConveLabs',
    description: 'Answers on at-home blood draws: pricing, insurance, prep, results timing, and service areas across Central Florida. Everything you need before you book.' },
  { path: '/book-now',
    title: 'Book a Mobile Blood Draw Orlando — ConveLabs',
    description: 'Book a licensed mobile phlebotomist in Central Florida in 90 seconds. Same-day slots, one-try draws, results in 48 hours. On-time or your visit is free.' },
  { path: '/blog',
    title: 'ConveLabs Blog | At-Home Lab Testing & Health Tips',
    description: 'Health insights, lab-test guides, and mobile phlebotomy news for Central Florida residents. Tips on blood work, wellness testing, and at-home care.' },
];

// ── Generic balanced-brace block extractor ───────────────────────
// Walks the source, and for every `slug: "..."` occurrence, slices the
// enclosing { ... } object. Works on pure data files (locations.ts,
// blogPosts.ts) without needing to import/execute them.
function extractBlocks(src) {
  const out = [];
  const slugRe = /slug:\s*["'`]([^"'`]+)["'`]/g;
  let match;
  while ((match = slugRe.exec(src)) !== null) {
    const slug = match[1];
    let i = match.index;
    while (i >= 0 && src[i] !== '{') i--;
    if (i < 0) continue;
    let depth = 1, j = i + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    out.push({ slug, block: src.slice(i, j) });
  }
  return out;
}

// ── Locations ────────────────────────────────────────────────────
function extractLocations(src) {
  const titleRe = /title:\s*["'`]([^"'`]+)["'`]/;
  const descRe = /description:\s*["'`]([^"'`]+)["'`]/;
  const nameRe = /name:\s*["'`]([^"'`]+)["'`]/;
  const ogImageRe = /ogImage:\s*["'`]([^"'`]+)["'`]/;
  const latRe = /latitude:\s*([\-\d.]+)/;
  const lonRe = /longitude:\s*([\-\d.]+)/;
  const zipRe = /postalCode:\s*["'`]([^"'`]+)["'`]/;

  const out = [];
  for (const { slug, block } of extractBlocks(src)) {
    const seo = {
      slug,
      name: nameRe.exec(block)?.[1] || slug,
      title: titleRe.exec(block)?.[1],
      description: descRe.exec(block)?.[1],
      ogImage: ogImageRe.exec(block)?.[1],
      latitude: parseFloat(latRe.exec(block)?.[1] || '0'),
      longitude: parseFloat(lonRe.exec(block)?.[1] || '0'),
      postalCode: zipRe.exec(block)?.[1],
    };
    if (seo.title && seo.description) out.push(seo);
  }
  return out;
}

// ── Blog posts ───────────────────────────────────────────────────
function extractBlogPosts(src) {
  const titleRe = /title:\s*["'`]([^"'`]+)["'`]/;
  const excerptRe = /excerpt:\s*["'`]([^"'`]+)["'`]/;
  const authorRe = /author:\s*["'`]([^"'`]+)["'`]/;
  const dateRe = /date:\s*new Date\(\s*["'`]([0-9T:\-\.Z ]+)["'`]\s*\)/;
  const imageRe = /image:\s*["'`]([^"'`]+)["'`]/;

  const out = [];
  for (const { slug, block } of extractBlocks(src)) {
    const title = titleRe.exec(block)?.[1];
    const excerpt = excerptRe.exec(block)?.[1];
    if (!title || !excerpt) continue; // skips the interface's `slug: string;`
    out.push({
      slug,
      title,
      excerpt,
      author: authorRe.exec(block)?.[1] || 'ConveLabs',
      date: dateRe.exec(block)?.[1] || null,
      image: imageRe.exec(block)?.[1] || null,
    });
  }
  return out;
}

function escapeHtmlAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Per-route meta builders ──────────────────────────────────────
function locationMeta(loc) {
  const canonical = `${ORIGIN}/locations/${loc.slug}`;
  const ogImage = loc.ogImage || DEFAULT_OG;
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
    geo: { '@type': 'GeoCoordinates', latitude: loc.latitude, longitude: loc.longitude },
    areaServed: { '@type': 'City', name: loc.name },
    priceRange: '$$$',
    openingHours: 'Mo-Sa 06:00-20:00',
  };
  return {
    routePath: `/locations/${loc.slug}`,
    title: loc.title,
    description: loc.description,
    canonical,
    ogImage,
    schemaJson: JSON.stringify(schema, null, 2),
  };
}

function staticMeta(r) {
  return {
    routePath: r.path,
    title: r.title,
    description: r.description,
    canonical: `${ORIGIN}${r.path}`,
    ogImage: DEFAULT_OG,
    schemaJson: null, // site-wide MedicalBusiness/Service schema from the shell is sufficient
  };
}

function blogMeta(post) {
  const canonical = `${ORIGIN}/blog/${post.slug}`;
  const ogImage = post.image ? `${ORIGIN}${post.image.startsWith('/') ? '' : '/'}${post.image}` : DEFAULT_OG;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: ogImage,
    url: canonical,
    mainEntityOfPage: canonical,
    author: { '@type': 'Person', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'ConveLabs',
      logo: { '@type': 'ImageObject', url: `${ORIGIN}/og-image-v2.png` },
    },
    ...(post.date ? { datePublished: post.date, dateModified: post.date } : {}),
  };
  // Blog titles get a brand suffix if they don't already mention ConveLabs.
  const title = /convelabs/i.test(post.title) ? post.title : `${post.title} — ConveLabs`;
  return {
    routePath: `/blog/${post.slug}`,
    title: title.length > 65 ? post.title : title, // avoid runaway-length titles
    description: post.excerpt,
    canonical,
    ogImage,
    schemaJson: JSON.stringify(schema, null, 2),
  };
}

// ── HTML rewriter ────────────────────────────────────────────────
function rewriteHtmlForRoute(baseHtml, meta) {
  let html = baseHtml;

  html = html.replace(/<title>[^<]*<\/title>/i,
    `<title>${escapeHtmlAttr(meta.title)}</title>`);

  html = html.replace(/<meta name="description" content="[^"]*"\s*\/?>/i,
    `<meta name="description" content="${escapeHtmlAttr(meta.description)}" />`);

  if (/<link rel="canonical"/i.test(html)) {
    html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i,
      `<link rel="canonical" href="${escapeHtmlAttr(meta.canonical)}" />`);
  } else {
    html = html.replace('</head>',
      `  <link rel="canonical" href="${escapeHtmlAttr(meta.canonical)}" />\n</head>`);
  }

  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:title" content="${escapeHtmlAttr(meta.title)}" />`);
  html = html.replace(/<meta property="og:description" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:description" content="${escapeHtmlAttr(meta.description)}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:url" content="${escapeHtmlAttr(meta.canonical)}" />`);
  html = html.replace(/<meta property="og:image" content="[^"]*"\s*\/?>/gi,
    `<meta property="og:image" content="${escapeHtmlAttr(meta.ogImage)}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/gi,
    `<meta name="twitter:title" content="${escapeHtmlAttr(meta.title)}" />`);
  html = html.replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/gi,
    `<meta name="twitter:description" content="${escapeHtmlAttr(meta.description)}" />`);

  html = html.replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/i,
    `<meta property="og:image:alt" content="${escapeHtmlAttr('ConveLabs — Concierge mobile lab services at your door. Licensed, fast, private.')}" />`);

  if (meta.schemaJson) {
    const schemaTag = `  <script type="application/ld+json" data-generated="per-route">\n${meta.schemaJson}\n  </script>\n`;
    html = html.replace('</head>', `${schemaTag}</head>`);
  }

  return html;
}

function writeRouteIndex(routePath, html) {
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

// Fix the stale 'luxury' og:image:alt on the ROOT index.html and use the
// corrected shell as the template for every generated route.
const rootHtml = baseHtml.replace(
  /<meta property="og:image:alt" content="ConveLabs — Luxury mobile lab services[^"]*"\s*\/?>/i,
  `<meta property="og:image:alt" content="ConveLabs — Concierge mobile lab services at your door. Licensed, fast, private." />`
);
if (rootHtml !== baseHtml) {
  fs.writeFileSync(INDEX_HTML, rootHtml, 'utf-8');
  console.log(`[generate-seo-html] ✔ Rewrote dist/index.html (fixed stale 'luxury' og:image:alt)`);
}

// 1. Locations
const locations = extractLocations(fs.readFileSync(LOCATIONS_SRC, 'utf-8'));
console.log(`[generate-seo-html] Locations: ${locations.length}`);

// 2. Static marketing routes
console.log(`[generate-seo-html] Static routes: ${STATIC_ROUTES.length}`);

// 3. Blog posts
const blogPosts = fs.existsSync(BLOG_SRC) ? extractBlogPosts(fs.readFileSync(BLOG_SRC, 'utf-8')) : [];
console.log(`[generate-seo-html] Blog posts: ${blogPosts.length}`);

const all = [
  ...locations.map(locationMeta),
  ...STATIC_ROUTES.map(staticMeta),
  ...blogPosts.map(blogMeta),
];

let wrote = 0;
for (const meta of all) {
  const html = rewriteHtmlForRoute(rootHtml, meta);
  const written = writeRouteIndex(meta.routePath, html);
  console.log(`  ✔ ${meta.routePath.padEnd(40)} → ${written}`);
  wrote++;
}

console.log(`[generate-seo-html] Done. ${wrote} per-route index.html files generated (` +
  `${locations.length} locations + ${STATIC_ROUTES.length} static + ${blogPosts.length} blog).`);
