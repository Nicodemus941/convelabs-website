# ConveLabs — Claude Code Project Guide

Mobile-phlebotomy platform (Central Florida). **Frontend:** Vite + React + TypeScript SPA.
**Backend:** Supabase (Postgres + 200+ edge functions). **Payments:** Stripe (Connect for
phleb payouts). **Deploy:** Vercel auto-builds on push to `main`.

## ⚠️ Repo location
This repo is `C:\Users\nicod\convelabs-website` (hyphen). Do **NOT** confuse it with the
sibling `C:\Users\nicod\Convelabs Website` (space) — that is a *different* repo
(`viberfixerapp`). All ConveLabs code lives here.

## 🚦 Standing rules (do not violate)
- **Never `git push` (any branch) without explicit per-push confirmation** from the owner.
  A PreToolUse hook forces a prompt; still confirm in chat. Prefer `/ship`.
- **Admin-only features gate on the `super_admin` role** (the business admin is super_admin,
  not office_manager).
- **External email** From + signature: `Nicodemme Jean-Baptiste <info@convelabs.com>`.
  Never use nico@convelabs.com (unmonitored).
- **Patient SMS/email:** respect quiet hours (9pm–8am ET) and the `NOTIFICATIONS_SUSPENDED`
  guard. Never message patients during data backfills.
- **I do not move money.** Stripe transfers/payouts are owner-triggered; I only do read-only
  diagnostics and DB data fixes.

## Ship workflow
Use **`/ship`** for any frontend change. It typechecks (`tsc -p tsconfig.app.json`), builds,
shows the diff, commits with a clear message, then **stops for push confirmation**. Don't
hand-run the steps — `/ship` is the single gate.

## Deploy model
- **Frontend:** commit → push `main` → Vercel runs `npm run build`
  (= `vite build && node scripts/generate-seo-html.mjs`). The generator prerenders per-route
  HTML for SEO.
- **Edge functions:** `npx supabase functions deploy <name> --no-verify-jwt --project-ref yluyonhrxxtyuiyrdixl`
  (public fns use `--no-verify-jwt`). After deploy, verify via Supabase MCP `get_logs`
  (service=edge-function) for BOOT_ERROR / 5xx in the last ~60s (a hook reminds you).
- **Supabase project ref:** `yluyonhrxxtyuiyrdixl`.

## Adding an indexable page (SEO)
1. Create the page + route in `src/routes/PublicRoutes.tsx`.
2. Add it to `STATIC_ROUTES` in `scripts/generate-seo-html.mjs` (title ≤60, description ≤160).
3. Add it to `public/sitemap.xml`.
Blog posts under `/blog/<slug>` are auto-handled from `src/data/blogPosts.ts`.

## Schema gotchas (verified — these bite)
- `appointments`: completion time is **`completion_time`** (NOT completed_at).
- `organizations`: phone is **`contact_phone`** (NO support_phone column).
- `staff_profiles`: **no `first_name`**; name lives in `auth.users.raw_user_meta_data->>'full_name'`.
- `error_logs`: jsonb column is **`payload`** (NOT context). Cols: error_type, component,
  action, error_message, error_stack, user_email, user_role, payload, resolved.
- `profiles`: only id, email, stripe_customer_id (no name columns).
- `user_memberships`: no `notes` column.

## Phleb payouts (context)
- `staff_payouts` rows; statuses: `pending` → `manual_owed` → `succeeded`
  (or `manual_settled` / `reversed`).
- Instant transfers gated by `system_settings.phleb_connect_payouts_disabled`
  (currently **true** → daily sweep only).
- Daily sweep: cron jobid 69 → `sweep-phleb-owed-payouts` at 06:00 UTC (2 AM ET).
