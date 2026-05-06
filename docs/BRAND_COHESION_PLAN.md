# Brand Cohesion Plan — Hormozi Revision (May 2026)

## North star

**Ship the rack card.** Make every screen, every email, every receipt feel like the rack card felt the first time we opened that PDF.

## Conversion hypothesis (Hormozi's required addition)

Brand cohesion + offer reinforcement on Tier-1 surfaces lifts `/book-now`
conversion by **8–15%** vs. the current bright-red-on-white aesthetic, based
on luxury concierge category benchmarks.

| Metric | Current baseline | Target after rollout | How we measure |
|---|---|---|---|
| `/book-now` → checkout-init rate | TBD (capture week 1) | +10% | PostHog event `booking_cta_clicked` w/ A/B cohort tag |
| Email open rate | Mailgun 28% | 35% | Mailgun open webhook → `email_send_log.opened_at` |
| Pricing-page → join-vip conversion | TBD | +20% | PostHog `vip_join_clicked` after pricing visit |
| Average sentiment word in NPS comments | "convenient" | "premium" | NPS quarterly review |

**Payback math:** at 30 visits/mo × $150 avg, +10% = ~3 incremental visits = $450/mo. 8h eng cost = breakeven month one. 12-month ROI on cohesion work alone: **~$5,400** before any compounded LTV / referral effect.

## The brand system (locked May 2026)

Source of truth: business card + rack card design language. Rendered live at `/brand`. Tokens in `src/styles/brand-tokens.css`.

**Three colors:** burgundy `#7F1D1D`, gold `#C9A961`, cream `#F8F4ED`
**Two fonts:** Playfair Display (display) + Inter (body)
**Five named patterns:** The Drop / The Gold Bar / The YOUR Italic / The Lockup / The Cream Canvas

## Execution tiers (ordered by money path)

### Tier 1 — converts money (this week, ~8h)
1. ✅ Brand tokens CSS + Tailwind tokens
2. ✅ `<BrandHero>` `<BrandGoldDivider>` `<BrandItalicAccent>` `<BrandFooterLockup>`
3. ✅ `brandedEmailWrapper()` for unified Mailgun sends
4. ⬜ Favicon + PWA manifest icon (the new burgundy drop) — *moved up per Hormozi*
5. ⬜ Homepage hero swap → `<BrandHero>` with: Founding-50 scarcity counter as `scarcityNode`, "Pays for itself in 1 visit" as `trustCloser`, named bundle CTAs ("Book The Wellness Stack")
6. ⬜ `/book-now` checkout step → cream canvas, burgundy CTA, gold divider, named-bundle continuity
7. ⬜ `/pricing` → BrandHero + tier cards on cream + Founding-50 counter on VIP
8. ⬜ Migrate every patient-facing email through `brandedEmailWrapper`:
   - booking confirmation
   - invoice
   - post-visit follow-up
   - lab-order request
   - membership welcome
9. ⬜ Site-wide find-replace: `bg-red-700` / `[#B91C1C]` → `bg-brand-burgundy`; pure white → `bg-brand-cream` on customer pages

### Tier 2 — builds credibility (next week, ~4h)
10. ⬜ `<BrandFooterLockup>` in global footer
11. ⬜ Provider portal landing (`/dashboard/provider`) re-skinned
12. ⬜ `/about` + `/concierge-phlebotomy` content pages
13. ⬜ Patient dashboard chrome
14. ⬜ Meta tags, OG image (cream + burgundy + drop), favicon set complete

### Tier 3 — internal-only (whenever, ~2h)
15. ⬜ Admin dashboard chrome
16. ⬜ Phleb PWA chrome
17. ⬜ Legacy `conve.*` Tailwind tokens deleted (only after every page migrated)

## Offer reinforcement (Hormozi's revision — bolted into Tier 1)

The brand alone doesn't lift conversion — the **offer through the brand** does.

- **Founding-50 counter** lives in `<BrandHero scarcityNode={…}>` on `/`, `/pricing`, `/concierge-phlebotomy`
- **"Pays for itself in 1 visit"** lives in `<BrandHero trustCloser={…}>` on every membership-pitching surface
- **Named bundle CTAs** replace generic "Book Now" wherever possible:
  - Homepage: *"Book The Wellness Stack →"*
  - Pricing: *"Claim VIP — 13 Founding seats left"*
  - /book-now: *"Confirm — same-week slots"*

## Don'ts (defended in code via the `/brand` reference page)

- ❌ No pure white backgrounds on customer pages — use `var(--brand-cream)`
- ❌ No `#B91C1C` bright red — use `var(--brand-burgundy)`
- ❌ No third typeface — Playfair + Inter only
- ❌ No gold for clickable UI — gold is decorative only
- ❌ No "Labs At YOUR Convenience" without the ®

## Measurement (Hormozi's required addition)

Before Tier-1 ships, instrument:

```
PostHog events:
  booking_cta_clicked      { surface, bundle, member_tier, cohort: 'brand_v2' | 'legacy' }
  vip_join_clicked         { surface, founding_seats_left }
  email_opened             { template, brand_v2: bool }
  bundle_cta_clicked       { bundle_name, surface }
```

Re-score in 30 days. Targets in the hypothesis table above. If `/book-now`
conversion doesn't lift ≥5%, investigate before continuing Tier 2 — the
brand may be cohering visually without strengthening the offer.

## Execution status (updated each commit)

- 2026-05-06 — foundation shipped: tokens, components, email wrapper, /brand reference, plan doc
- next: favicon swap, homepage hero migration, email template migration
