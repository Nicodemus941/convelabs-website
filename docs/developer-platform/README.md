# ConveLabs API — Pre-Code Strategic Deliverables

*Drafted 2026-05-19 in support of the active plan in `~/.claude/plans/purrfect-roaming-sunrise.md` (the "ConveLabs as a Claude Code Connector + Developer Platform" plan).*

No code has been written for the developer platform. These four documents are the pre-code work the owner needs to drive beta-partner conversations. Once 3 MOUs are signed, Phases 1–4 (code build) unlock.

## Documents

1. **[01_PRICING_AND_OFFER.md](./01_PRICING_AND_OFFER.md)** — the 3 subscription tiers, credit packs, BAA gating, the two-revenue-streams story, and the implicit-ROI hook. Hormozi-structured. Owner approval required before any partner conversation.

2. **[02_BETA_PARTNER_MOU.md](./02_BETA_PARTNER_MOU.md)** — one-page memorandum of understanding template. Replace bracketed fields, send via DocuSign or HelloSign. Non-binding except for confidentiality + HIPAA. Includes the Hormozi-style "intent to pay" clause.

3. **[03_RISK_REGISTER.md](./03_RISK_REGISTER.md)** — 12 risks (3 critical, 3 high, 4 medium, 2 low) with named owners and mitigations. Must be reviewed before each beta-partner kickoff.

4. **[04_BETA_PARTNER_OUTREACH.md](./04_BETA_PARTNER_OUTREACH.md)** — 4 distribution channels with ranked candidate lists and verbatim outreach scripts per channel. Goal: 3 MOUs signed by Fri 2026-05-23.

5. **[05_PRICING_PAGE_MOCKUP.html](./05_PRICING_PAGE_MOCKUP.html)** — standalone HTML pricing page. Open in a browser to preview. Use as a leave-behind in partner conversations. Not wired to Stripe, not linked from the site.

## What's NOT in this folder

- Any code (edge functions, MCP server, etc.) — all deferred until beta partners signed
- Stripe products / prices for the 3 tiers — created at apply time, not now
- API documentation / OpenAPI spec — generated from code, which doesn't exist yet
- Public developer page on the site — replaced by the HTML mockup above for the beta phase

## Owner action this week

1. Review `01_PRICING_AND_OFFER.md`. Approve or edit the 3 tier price points.
2. Review `02_BETA_PARTNER_MOU.md`. Edit any language. Get a copy into DocuSign.
3. Review `04_BETA_PARTNER_OUTREACH.md`. Pick 3 of the candidates by Fri 2026-05-23. Send first-touch outreach.
4. Open the shared Google Sheet (template described in `04`) and start populating.

## Review cadence after beta starts

- Weekly check-in: count of bookings via API per partner, support hours spent
- Monthly: review pricing — if 2+ partners haven't winced at price, raise it 30% for the next cohort
- 60-day mark: re-read `03_RISK_REGISTER.md`, update statuses
- End of beta: decision to greenlight Phase 1 code build (or revisit the platform thesis)
