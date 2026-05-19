# Beta Partner Outreach — Targets + Scripts

*Goal: select 3 partners from this shortlist by **Fri 2026-05-23**. One per distribution channel. Send the appropriate script verbatim or lightly edited.*

---

## Selection criteria checklist

A candidate qualifies for the shortlist if:

- ✅ Has an **existing customer base** that would book lab draws (we're not validating demand — they are)
- ✅ Operationally ready to go live **within 14 days**
- ✅ Willing to commit **2 hours/week** of structured feedback during beta
- ✅ Different distribution channel from the other beta partners (no two in the same vertical)
- ✅ Low competitive overlap with our direct B2C business
- ✅ Decision-maker is responsive (replies to first outreach within 5 business days)

A candidate is **disqualified** if:

- ❌ They are a direct competitor (Workpath, Getlabs, Speedy Sticks, Phlebio, etc.)
- ❌ They operate in adjacent territory but want to use the API to enter Orlando
- ❌ They need PHI access without a BAA they can sign within a week
- ❌ Decision-making committee is more than 3 people (slow conversion = wasted beta slot)

---

## Channel 1 — Longevity / functional-medicine clinic

### Why this channel
Patients on quarterly bloodwork programs. Tech-forward staff. Already see ConveLabs draws as a value-add. Visit values average $200+ so the per-visit margin is strong.

### Candidates (rank-ordered)

| # | Candidate | Why them | First-pass risk | Owner action |
|---|---|---|---|---|
| 1 | **NaturaMed Health** | Existing ConveLabs partner. Already has org-billed pricing. Owner is responsive. | None — established trust | Slack/text Dr. Naturamed Mon 5/19 |
| 2 | **Restoration Place** | Existing partner. Patient base values convenience. | They prefer in-office; verify API use case fits | Email TRP after talking to NaturaMed |
| 3 | **Aristotle Education (sister clinic if exists)** | Existing partner. Bills patients directly. | Niche use case — needs lab orders pre-attached | Hold as backup |
| 4 | **Healthinkers** (referenced in prior outreach docs) | Coach network in our service area | Cold relationship — slower conversion | Cold outreach if 1-3 decline |

### Outreach script — "Existing partner" version

**Subject:** Quick offer for [PARTNER FIRST NAME] — free beta access to something new

Hi [FIRST NAME],

We're rolling out a private beta of a new ConveLabs API that lets your patient portal book a draw automatically — instead of your staff calling us or your patients filling out our intake form.

I'd love to give you free access through beta (would normally be $499/mo) in exchange for ~2 hours a week of feedback over the next 90 days.

If you're open to it, I can have a 15-minute kickoff this week.

Cheers,
Nicodemme
ConveLabs · (941) 527-9169 · info@convelabs.com

---

## Channel 2 — HubSpot / CRM-embedded wellness platforms

### Why this channel
Validates the embeddable widget thesis. HubSpot Marketplace is shelf space. One success story unlocks 1000+ similar partners.

### Candidates (rank-ordered)

| # | Candidate | Why them | First-pass risk | Owner action |
|---|---|---|---|---|
| 1 | **A HubSpot-using wellness coach in owner's LinkedIn network** | Highest-trust intro. Fastest yes. | Identify them — needs owner to scan LinkedIn first | LinkedIn search "wellness coach HubSpot Florida" |
| 2 | **One of the dietitians on the Sarah Steckler / Beverly Vita-style coach network** | Frequent labs, tech-savvy | Cold; ~10% reply rate | 5 cold DMs |
| 3 | **Smaller telehealth wellness platforms (cold)** | They have devs and product muscle | Long sales cycle | Defer |

### Outreach script — Cold LinkedIn DM

**Subject (if email):** Embed lab-draw booking in your HubSpot client journey

Hey [FIRST NAME],

Saw you're running [BUSINESS NAME] on HubSpot. We're building a HubSpot-native integration that lets you trigger a mobile blood-draw appointment from any workflow — when a client hits day 30, when they complete a milestone, whatever.

Looking for 3 wellness coaches to try it free for 90 days in exchange for feedback. Would you want to be one?

Happy to send a 2-minute demo video if you'd like to see it first.

Nicodemme @ ConveLabs

---

## Channel 3 — Corporate-wellness platform

### Why this channel
Highest contract values per partner. B2B sales cycle, but a single Scale-tier win pays for the whole platform build.

### Candidates (rank-ordered)

| # | Candidate | Why them | First-pass risk | Owner action |
|---|---|---|---|---|
| 1 | **Aristotle Education (if they have an internal employee-wellness program)** | Existing trust + employee base | Their use case may be too small | Ask Aristotle this week |
| 2 | **Vitality Group / Wellable / similar mid-market** | Tech-forward, dev resources | Long sales cycle, multi-stakeholder | Cold outreach; expect 4-6 week conversion |
| 3 | **An owner-network corporate-wellness lead** | Trust-based intro | Identify | Owner scans network |

### Outreach script — Corporate-wellness platform (warm)

**Subject:** A bigger version of what we already do together

Hi [FIRST NAME],

We've been delivering [N] draws/month to your [team / program] over the past [time]. Now I want to make the workflow embedded in your existing systems instead of going through our admin portal.

We have a new API in private beta. If you sign up as a beta partner:

- Free Growth-tier access ($499/mo value) for 90 days
- Per-zip capacity reservation so your enterprise clients never see "no slots available"
- Co-marketing once we go public (your logo on our partners page if you want it)

In exchange: 2 hours/week of structured feedback through beta.

15-minute kickoff this week?

— Nicodemme

---

## Channel 4 — Claude Code / MCP / AI agent builder

### Why this channel
This is the partner Hormozi would call the *Trojan horse* — someone with a developer audience who would naturally publish content about integrating ConveLabs into AI agents. Free distribution.

### Candidates (rank-ordered)

| # | Candidate | Why them | First-pass risk | Owner action |
|---|---|---|---|---|
| 1 | **A solo healthtech-builder posting in the Anthropic / MCP discord** | High match for our MCP connector vision; will write about us | Cold — need to find them | Post in MCP discord, offer free Scale tier to one builder |
| 2 | **A YC-Winter-2026 healthtech founder building an AI patient assistant** | Will use the API to ship faster; will tweet about it | YC founders are oversubscribed | Cold DM 3-5 from the batch list |
| 3 | **An indie hacker building "AI longevity coach" or similar** | Volume of API calls will be honest signal of value | Solo dev = low staying power | Watch as a wildcard |

### Outreach script — Cold DM to AI builder

**Subject (Twitter / Discord / Slack DM):**

Hey — saw you're building [PROJECT]. If you ever need to book actual lab draws for users, we have a Claude Code MCP connector + REST API in beta. Free during beta. Want to be one of 3 first partners? Reply yes and I'll send the details.

— Nico, ConveLabs

---

## Tracking

Open a shared Google Sheet titled "ConveLabs API Beta Pipeline" with columns:

- Candidate name
- Channel (1-4)
- First-contact date
- Reply received? (Y/N)
- Reply date
- Decision (shortlisted / declined / parked)
- MOU sent date
- MOU signed date
- BAA signed date
- Production access granted date
- First booking via API date

Review weekly until 3 MOUs are signed.

---

## Decision criteria for the final 3

When more than 3 candidates accept, choose the trio that:

1. Covers **3 different channels** (not 3 from the same one)
2. Has the **highest forecasted call volume** in the first 90 days
3. Includes **at least one** partner with a developer/integration team (so they can actually integrate quickly, not just want to)
4. Includes **at most one** "cold" candidate (the rest should be warm/existing relationships)

If at any point a candidate slows or ghosts, move them to "parked" and accelerate the next one on the channel list.
