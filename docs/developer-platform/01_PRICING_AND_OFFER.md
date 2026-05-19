# ConveLabs API — Pricing & Offer (Beta Draft v1)

*Draft 2026-05-19 · Owner approval required before any partner conversation*

---

## What we're selling

A REST + MCP API that lets a developer's app **find lab-draw availability, book a visit, attach a lab order, and receive event webhooks** anywhere ConveLabs operates. The developer never has to source a phlebotomist, build a slot grid, or handle HIPAA-grade specimen logistics — we handle the entire backend.

## Naming

**Working name through beta:** "ConveLabs API."
Brand decision (whether to spin a sub-brand like `Drawline` or `BloodlinkAPI`) is **deferred until public launch.**

## The pricing ladder — Hormozi 3-tier

Three monthly plans. Middle tier is the "Most popular" anchor. Top tier is the decoy that makes the middle look reasonable.

### Starter — **$99 / month**

For: single coach, longevity practitioner, side-project builder.
- 200 API calls per month
- 50 booked visits per month
- Email support, 24-hour response
- Click-through Business Associate Agreement (BAA)
- Standard webhooks (appointment.created, appointment.completed)

### Growth — **$499 / month** *(Most popular)*

For: HubSpot wellness platforms, multi-location coaches, telehealth startups.
- 2,000 API calls per month
- **Unlimited booked visits**
- Webhooks with retries and signed payloads
- Slack channel, 4-hour response in business hours
- Click-through BAA
- White-label booking widget (iframe + JavaScript SDK)
- Member tier inheritance (their patients can become ConveLabs members at a partner-discounted rate, split with the partner)

### Scale — **$2,499 / month**

For: large medical groups, hospital pilots, healthtech platforms with 100+ end customers.
- **Unlimited API calls**
- Single Sign-On (SSO) for the partner's admin team
- Dedicated Customer Success Manager (CSM)
- 99.5% uptime SLA with credits for breach
- Custom-signed BAA (not click-through)
- Per-zip / per-day capacity reservations (we hold draw slots for them)
- Territory exclusivity in named ZIPs ($500/zip/mo add-on)
- Quarterly business review with the owner

## Overage pricing

When a partner exceeds their plan's included calls, the next call is billed at the overage rate. Soft warn at 80%, hard 429 at 100% with `upgrade_url`.

| Tier | Overage rate per call |
|---|---:|
| Starter | $0.50 |
| Growth | $0.30 |
| Scale | n/a (unlimited) |

## Credit packs (one-shot, for irregular usage)

For partners whose usage is bursty (one big test month, then quiet), or who want to prepay without a subscription.

| Pack | Price | Per-call |
|---|---:|---:|
| 1,000 calls | $300 | $0.30 |
| 10,000 calls | $1,500 | $0.15 |
| 100,000 calls | $10,000 | $0.10 |

The 100,000-call pack is intentionally a decoy. It anchors enterprise prospects and frames the Growth plan as a steal.

## Free trial

**30 days OR 100 calls, whichever comes first.** No credit card required to start. After expiration the API returns `402 trial_expired` with `upgrade_url`.

Auto-converts to paid ONLY if the partner exceeds 100 calls AND has saved a payment method. Otherwise the keys go cold and we send a re-engagement email.

## Two revenue streams per partner

**This is the underrated Hormozi move and the most important slide.**

1. **Subscription / overage fees** — pays for the platform itself.
2. **Visit revenue** — every appointment booked through the API is still a ConveLabs visit. The patient (or the partner's billing entity, depending on contract) pays us for the actual draw at our normal rates.

So a Growth-tier partner doing 100 visits/month at $150 avg pays us:
- $499 subscription
- ~$15,000 in visit revenue
- = **$15,499/mo per Growth partner**

Visit margin per Hormozi business-floor rule: $87 to ConveLabs, remainder to phleb. So at 100 visits, ConveLabs nets $8,700 from visit volume + the full $499 subscription = **$9,199/mo per Growth partner.**

## The ROI hook (use in every pitch)

> "Building your own mobile-phlebotomy network from scratch costs $200K+ before the first vein is drawn — 1 medical director on retainer, 4 phlebs on salary, malpractice insurance, kit inventory, specimen logistics, EHR integration, regulatory licensing. We sell you the network on a subscription. The first visit you don't have to source pays for the entire year."

## BAA gating (hard requirement)

No API key issues without a signed BAA. Period. Use the existing `sign-baa` edge function in the codebase to make this a click-through during plan signup. For Scale-tier prospects, a written BAA is negotiated before any key is issued.

## What we do NOT offer in beta

Deliberately scoped down to prevent feature sprawl while we learn what partners actually want:
- ❌ White-label phleb-app (their staff using their branded version of our PWA) — deferred to v2
- ❌ Multi-region phleb networks — Orlando-area only during beta
- ❌ Same-day SLA on visits — beta partners use our standard 90-min lead time
- ❌ Custom result delivery (HL7 FHIR push) — deferred to v2
- ❌ Lab-result reporting back via the API — deferred to v2 (results stay in the patient portal)

## Sales argument by partner type

**Longevity / functional-medicine clinic:**
> Your patients need draws every 3 months. Right now you tell them to drive to LabCorp. We embed a "Book Your Draw" button in your patient portal. Their first booking pays for your subscription. You collect the visit fee or comp it as part of their membership.

**HubSpot wellness CRM user:**
> Add ConveLabs to your client journey workflow. When a coaching client hits the 30-day mark, HubSpot triggers a ConveLabs API call, books the follow-up bloodwork, and updates the contact record when results land. Zero manual work.

**Corporate-wellness platform:**
> Your enterprise client wants on-site biomarker checks twice a year for 500 employees. You don't have a phleb network. We provide it. You bill the employer, we handle delivery, you keep the relationship.

**Claude Code / AI agent builder:**
> Your AI health assistant agent can now book actual lab draws when a patient asks. From "should I get my cholesterol checked" to "your appointment is confirmed for Tuesday at 9 AM" in one conversation.

---

## Open questions for owner

1. Are these tier price points right? Hormozi rule: start 2x higher than gut says. If we under-anchor we leave money on the table.
2. Do we want a **founding-developer discount** mirroring our Founding 50 patient program? E.g. first 10 partners on Growth get $299/mo lifetime?
3. Territory exclusivity: $500/zip/mo is a guess. Is that too cheap given the moat it creates?
4. Should we publish pricing publicly, or "Contact us" through beta to maintain pricing flexibility?
