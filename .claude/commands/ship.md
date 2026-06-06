---
description: Typecheck + build + commit the current change, then stop for push confirmation
---

Ship the current ConveLabs frontend working changes, following the project's standing rules
(see CLAUDE.md). Run these steps **in order, stopping on the first failure**:

1. **Review** — `git status --short` and `git diff --stat` so we both see exactly what's changing.
2. **Typecheck** — `npx tsc --noEmit -p tsconfig.app.json` (or `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json`).
   If any `error TS` lines appear, **STOP**, report them, and do not commit.
3. **Build** — `npm run build` (runs `vite build` + `scripts/generate-seo-html.mjs`).
   If it fails, **STOP** and report the error.
4. **SEO check** — if the change adds or edits an indexable page, confirm it's registered in
   `STATIC_ROUTES` (`scripts/generate-seo-html.mjs`) and `public/sitemap.xml`. Flag if missing.
5. **Commit** — stage only the intended source files (**never `dist/`**) and commit with a
   clear conventional-commit message (what changed + why). End the message with:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
6. **STOP — do not push.** Print the commit hash and ask the owner to confirm the push to
   `main` (standing per-push rule). Only push after an explicit "yes".

If `$ARGUMENTS` is provided, use it as the commit message / scope hint.
