# ConveLabs API — Risk Register (Pre-Beta)

*All risks must have an owner-acknowledged mitigation before any partner conversation. Last updated 2026-05-19.*

---

## Severity scale

| Symbol | Meaning |
|---|---|
| 🔴 Critical | Could end the business or cause patient harm. Must be mitigated before any external partner access. |
| 🟠 High | Material brand, revenue, or operational impact. Mitigated before public launch. |
| 🟡 Medium | Manageable through process; document and monitor. |
| 🟢 Low | Awareness only; revisit quarterly. |

---

## 🔴 Critical risks

### R-01: HIPAA Business Associate Agreement (BAA) exposure
**Threat:** A partner accesses Protected Health Information (PHI) via the API without a signed BAA in place. ConveLabs and the partner both face HHS Office for Civil Rights enforcement, fines up to $1.5M per violation per year, and a mandatory breach notification to every affected patient.

**Mitigation:**
- The existing `sign-baa` edge function is wired into the API-key issuance flow as a hard prerequisite. **No BAA, no API key.**
- Click-through BAA acceptable for Starter and Growth tiers (auto-emailed PDF with signature on file).
- Written BAA negotiated for Scale tier before key issuance.
- Quarterly audit query: every active API key must have a non-null `baa_signed_at` and `baa_pdf_storage_key`.

**Owner:** Founder.
**Status:** Process mitigation drafted. Implementation deferred until Phase 1 of code build.

### R-02: A partner's app double-charges or misroutes a patient via our API
**Threat:** A buggy or malicious partner integration creates duplicate appointments, charges the wrong card, or sends a draw to the wrong address. Patient blames ConveLabs (our brand on the visit), files a complaint, posts a review, may pursue a chargeback or small-claims action.

**Mitigation:**
- Server-side idempotency on `POST /v1/appointments` keyed on `Idempotency-Key` header (Stripe-style).
- Per-partner rate cap: max 5 bookings per minute per API key during beta.
- Anomaly monitor on `api_call_logs`: 10x daily volume spike alerts ops within 5 minutes.
- Scale tier requires a written indemnification clause; Starter/Growth covered by click-through TOS.
- 24/7 patient-facing support number is ConveLabs's, not the partner's — patient escalation never gets lost.

**Owner:** Founder + Legal (TBD).
**Status:** Idempotency pattern proven elsewhere (Stripe webhooks); needs to be enforced in `v1-router`.

### R-03: Phleb capacity overflow
**Threat:** A partner sends 500 bookings in a week. We have 1-2 phlebs in beta. We either oversell (patients sit unservened) or hard-reject (partner loses trust, churns).

**Mitigation:**
- Per-zip, per-day capacity cap built into `/v1/appointments`. Returns `capacity_exceeded` with the next-available date so the partner can show their user real options rather than a brick wall.
- Daily volume forecast surfaced to the phleb dashboard so we hire ahead of demand.
- Capacity holds for Scale-tier partners: they pay $500/zip/mo for guaranteed slots.
- Beta MOU caps each partner at 25 visits in the 90-day window — sustainable for current capacity.

**Owner:** Founder + phlebotomist.
**Status:** Capacity-cap logic doesn't exist yet — must ship with Phase 1.

---

## 🟠 High risks

### R-04: B2C vs B2B cannibalization
**Threat:** Workpath, Getlabs, or another mobile-phleb competitor uses our API to acquire patients in our own service area, undercutting our direct-to-consumer pricing.

**Mitigation:**
- Beta carefully excludes direct competitors — only end-user-facing partners (clinics, coaches, corporate-wellness) qualify.
- Scale-tier contracts include a non-compete clause: partner agrees not to operate a competing mobile-phleb service in the contiguous US for the term of the agreement.
- Public pricing on the developer page makes our floor explicit; competitors cannot undercut without losing margin.
- Territory exclusivity ($500/zip/mo) becomes a moat when a partner takes a dense market.

**Owner:** Founder.
**Status:** Beta partner filter checklist needs to be added to `02_BETA_PARTNER_MOU.md` review.

### R-05: Pricing under-shoot
**Threat:** Beta partners say "yes" too easily because our prices are too low. We leave revenue on the table and lock in cheap-tier customers for years.

**Mitigation:**
- Hormozi heuristic: if the first 3 beta candidates accept the price without flinching, raise it 30% before the public launch.
- Document each beta partner's "willingness-to-pay" indirectly during onboarding: ask them what they currently spend on lab-draw access, what they'd pay for our solution if it were paid today. Capture in a spreadsheet.
- Avoid public price posting through beta. "Contact us for pricing" lets us A/B test quotes.

**Owner:** Founder.
**Status:** No public pricing until beta data informs final numbers.

### R-06: API uptime / reliability incident
**Threat:** API goes down during a partner's peak hour. They miss bookings. Trust collapses.

**Mitigation:**
- Reuse the existing `system-health-monitor` and `auto-heal` edge functions to monitor `/v1/*` specifically.
- Status page at `status.convelabs.com` updated automatically from monitor.
- SLA tier (Scale only) includes credit for SLA breach.
- Pre-launch chaos test: simulate 30s of Stripe API downtime, verify graceful error response.

**Owner:** Founder.
**Status:** Existing monitoring is robust; just needs an API-specific endpoint added.

---

## 🟡 Medium risks

### R-07: Support burden
**Threat:** 3 beta partners + the existing patient-side support load + the existing phleb-side support load = the founder's calendar gets buried.

**Mitigation:**
- One Slack channel per partner. Use the AI sales chat (already deployed) for tier-1 questions.
- Time-box: 2 hours per partner per week. If a partner needs more, they're not a fit yet — escalate to a future paid-CSM tier.
- Documentation as a moat: every question that comes in adds an FAQ entry, dropping future questions on it.

**Owner:** Founder.

### R-08: MCP / Anthropic policy changes
**Threat:** Anthropic deprecates an MCP feature we depend on. Our connector breaks.

**Mitigation:**
- The REST API is the source of truth. The MCP connector is a thin wrapper.
- If MCP changes, we publish a new version of the connector without touching the rest of the platform.
- Versioning the connector with semver (e.g., `@convelabs/mcp@1.0.0`) lets partners pin.

**Owner:** Founder.

### R-09: Pricing transparency leak
**Threat:** A beta partner shares our pricing structure with a competitor (Workpath / Getlabs) who uses it to undercut us at the patient level.

**Mitigation:**
- MOU confidentiality clause covers pricing during beta.
- Beta partners chosen specifically for low competitive overlap with our consumer market.

**Owner:** Founder + Legal (TBD).

### R-10: Tech debt accumulation
**Threat:** The router function (`/v1/*`) becomes a monolith. Every endpoint adds 100 lines. Maintenance burden grows.

**Mitigation:**
- Router uses dispatch table pattern from day 1: each endpoint is a separate handler file imported by the router.
- TypeScript strict mode on the router subdirectory.
- Routes file is the OpenAPI source of truth — generate the OpenAPI spec from the route handlers, not the other way around.

**Owner:** Developer.

---

## 🟢 Low risks

### R-11: Anthropic acquires or shutters the MCP marketplace
**Threat:** The marketplace we list on becomes the only distribution channel; if it shuts down, our distribution dies.

**Mitigation:**
- Multi-marketplace strategy from day 1 (Zapier, Make, HubSpot, etc.). MCP is one of several.

### R-12: Naming dispute
**Threat:** Sub-brand we eventually pick (Drawline, etc.) is trademarked by someone else.

**Mitigation:**
- USPTO TESS search BEFORE any spend on branding.
- Beta sticks with "ConveLabs API" until name lock.

---

## Risks consciously NOT covered in beta

These are real future risks but explicitly NOT mitigated in the beta scope, because the cost of mitigation exceeds the cost of accepting them while we're still proving demand:

- **Multi-region capacity** (only Orlando in beta)
- **Lab-result delivery back to partner via API** (deferred to v2 — beta partners use ConveLabs patient portal for results)
- **HL7 FHIR compliance** (deferred to v2 — beta partners are not hospital systems)
- **GDPR / international** (US-only in beta)
- **Audit-log export** (deferred to v2 — beta partners get a CSV on request)
- **White-label phleb PWA** (deferred to v2)

---

## Review cadence

- This document is reviewed **before each beta-partner kickoff** to re-confirm assumptions
- Updated **after every monthly business review** of the platform
- Owner sign-off required to move any 🔴 Critical risk to "mitigated" status
