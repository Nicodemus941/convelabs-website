# ConveLabs — Claude Code Project Guide

Mobile-phlebotomy platform (Central Florida). **Frontend:** Vite + React + TypeScript SPA.
**Backend:** Supabase (Postgres + 200+ edge functions). **Payments:** Stripe (Connect for
phleb payouts). **Deploy:** Vercel auto-builds on push to `main`.

## ⚠️ Repo location
This repo is `C:\Users\nicod\convelabs-website` (hyphen). Do **NOT** confuse it with the
sibling `C:\Users\nicod\Convelabs Website` (space) — that is a *different* repo
(`viberfixerapp`). All ConveLabs code lives here.

## 🚦 Standing rules (do not violate)
- **Never deploy to Vercel from the CLI.** No `vercel`, `vercel --prod`, `vercel deploy`,
  or `vercel build` for this project, ever. Production is published **only** by Vercel
  building a commit on `main`. See "Deploy model" below for why.
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

## ⛔ Why CLI deploys are banned (2026-09-17 incident)
From 2026-08-06 to 2026-09-11 this repo was deployed to production with the Vercel CLI from
the OpenClaw droplet (`/root/convelabs-website`) instead of through GitHub. Consequences:

- GitHub `main` sat at Aug 5 while the live site ran ~6 weeks of newer code.
- Two features existed **only** inside the built deployment, in no branch at all: the live
  `send-fasting-reminders` (8–9 PM ET self-gate on the */15 cron) and the checkout
  `resetNotice` alert in `BookingFlow`/`DateTimeSelectionStep`. Both had to be reverse-
  engineered out of the production bundle to be recovered.
- A routine push to `main` then published Aug-5 code over the live site and had to be rolled
  back from the Vercel dashboard.

The droplet's `.vercel` link was moved to `/root/vercel-link-backups/` on 2026-09-17 so
`vercel --prod` can no longer target this project from there.

**Correct flow for every change (including agent work):**
1. Work on a branch; commit with a real message. Never leave edits uncommitted — an
   uncommitted file is code that exists nowhere but one disk.
2. Push the branch and let the owner merge to `main` (or push `main` with explicit
   confirmation, per the standing rule).
3. Vercel builds `main` and publishes. Verify the live bundle changed:
   `curl -s https://www.convelabs.com/ | grep -o '/assets/index-[^"]*\.js'`

**Before assuming production matches `main`,** compare that live bundle hash against the
latest `main` deployment in Vercel. If they differ, something was published outside Git —
stop and reconcile before pushing anything.

Edge functions are different: `npx supabase functions deploy ...` is still the correct path,
but commit the function source first, for the same reason.

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
