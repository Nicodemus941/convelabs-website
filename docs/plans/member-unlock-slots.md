# "Become a Member to Unlock" Slot Gating — Hormozi Structure

*Show all the slots. Lock the valuable ones behind a membership. Patient
sees what they could have. Anchor-flip the upgrade right at the decision
moment, when they're already mentally committed to booking.*

---

## Why this is a Hormozi Grand Slam move

**Rule #1: Scarcity beats features.** A non-member today sees 8 AM slots as "available" — which they are, but only for the member who walks in first. By explicitly labeling those slots "Members only", we:

1. **Create loss aversion in the moment** — patient can SEE the 6 AM slot they want, but it's locked. Loss of something specific hits harder than the abstract "join our membership."
2. **Make the upgrade contextual** — *"Unlock 6 AM for $99/yr — saves you $45 on THIS visit"* is a concrete trade, not a generic pitch.
3. **Reinforce the value prop** — patients who don't convert today see the locked slot every time they book. Second and third bookings compound the desire.
4. **Tier clarity** — right now "VIP" is abstract. Seeing a 7 AM slot labeled *"VIP — unlock for $199/yr"* teaches them what VIP means by showing the VIP-exclusive behavior.

**Hormozi's frame:** the slot isn't the product. The EARLINESS is the product. Member pays for the privilege of not interrupting their workday with a lab visit. That's the pitch. Our UI should make it obvious.

---

## Tier → slot access mapping (pulled from your existing membership windows)

| Tier | Rate | Mon–Fri | Sat | Sun | After hours |
|---|---|---|---|---|---|
| **Non-member** | $0 | 9 AM – 12 PM | — | — | — |
| **Regular Member** | $99/yr | 6 AM – 12 PM | 6–9 AM | — | — |
| **VIP** | $199/yr | 6 AM – 2 PM | 6–11 AM | — | — |
| **Concierge** | $399/yr | 6 AM – 8 PM | all day | By request | ✅ (5–8 PM weeknights) |

The provider-initiated lab-request flow still respects `organizations.time_window_rules` as a hard ceiling. But within the org's window, if a patient is patient-pay, member unlocks apply.

---

## The patient experience (with wireframe)

### At the slot grid

Patient picks a date → server returns `slots[]` where each slot has:
```typescript
{
  time: '6:00 AM',
  available: true,
  requires_tier?: 'regular_member' | 'vip' | 'concierge',
  unlock_price?: 99 | 199 | 399,
  unlock_savings_on_this_visit?: 45
}
```

The grid renders four visual states:

```
┌─────────────────────────────────────────────┐
│ Your provider ordered bloodwork by Fri May 2 │
│                                              │
│ Pick a time — Tue, Apr 21                    │
│                                              │
│ ┌───────┐ ┌───────┐ ┌───────┐                │
│ │ 6:00  │ │ 6:30  │ │ 7:00  │                │
│ │  AM   │ │  AM   │ │  AM   │  ← LOCKED      │
│ │  🔒   │ │  🔒   │ │  🔒   │     (Regular)  │
│ │ Member│ │ Member│ │ Member│                │
│ └───────┘ └───────┘ └───────┘                │
│                                              │
│ ┌───────┐ ┌───────┐ ┌───────┐                │
│ │ 7:30  │ │ 8:00  │ │ 8:30  │  ← LOCKED      │
│ │  🔒   │ │  🔒   │ │  🔒   │     (Regular)  │
│ └───────┘ └───────┘ └───────┘                │
│                                              │
│ ┌───────┐ ┌───────┐ ┌───────┐                │
│ │ 9:00  │ │ 9:30  │ │10:00  │  ← AVAILABLE   │
│ │  AM   │ │  AM   │ │  AM   │     (all)      │
│ └───────┘ └───────┘ └───────┘                │
│                                              │
│ ┌───────┐ ┌───────┐ ┌───────┐                │
│ │10:30  │ │11:00  │ │11:30  │  ← AVAILABLE   │
│ └───────┘ └───────┘ └───────┘                │
│                                              │
│ ┌───────┐ ┌───────┐                          │
│ │ 1:00  │ │ 1:30  │  ← LOCKED               │
│ │  🔒   │ │  🔒   │     (VIP)               │
│ └───────┘ └───────┘                          │
│                                              │
│ ┌─────────────────────────────────────────┐ │
│ │ ⚡ 6 AM is popular — book with Regular    │ │
│ │ Member for $99/yr (save $45 on this visit│ │
│ │ + every future visit)                     │ │
│ │                                           │ │
│ │         [ Unlock 6 AM slot →  ]           │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### When patient taps a locked slot

```
┌───────────────────────────────────────────────┐
│  🔒  This slot unlocks with Regular Member    │
│                                                │
│  6:00 AM — before most offices open.           │
│  You'd be home/at work before 7 AM.            │
│                                                │
│  ┌─────────────────────────────────────────┐  │
│  │ Math for THIS visit:                    │  │
│  │   Non-member rate:       $150           │  │
│  │   Regular Member rate:   $130           │  │
│  │   Regular Member fee:     $99 /yr       │  │
│  │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │  │
│  │   Savings today:         $20            │  │
│  │   Plus save $20 on every future visit   │  │
│  │   (3 more visits/yr = $60 more savings) │  │
│  │   Net: membership PAYS FOR ITSELF in    │  │
│  │   year 1 at 4 visits.                   │  │
│  └─────────────────────────────────────────┘  │
│                                                │
│  [ Join Regular + book this slot — $229 ]    │  ← combined bill
│  [ Skip, pick an available slot instead ]    │
│                                                │
│  Thinking about VIP? $199/yr unlocks ALL      │
│  morning + early afternoon slots. [See VIP]   │
└───────────────────────────────────────────────┘
```

### After they join (during same flow)

- Single Stripe checkout: [Membership $99] + [Visit $130] = $229 in one transaction
- Membership activates on payment success
- Visit is confirmed at Regular Member pricing
- Patient sees *"Welcome — you just unlocked 6 AM slots forever 🎉"* on success screen
- All future visits default to member tier

---

## Technical structure

### Schema additions

```sql
-- Already exists: user_memberships + membership_plans
-- New: bookings can reference membership purchased concurrently
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS member_tier_applied text,  -- 'none' | 'regular_member' | 'vip' | 'concierge'
  ADD COLUMN IF NOT EXISTS bundled_membership_id uuid; -- if they joined on this booking

-- Track lock-slot interactions for analytics (did seeing locks convert?)
CREATE TABLE IF NOT EXISTS slot_lock_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,          -- browser-persistent random id
  access_token text,        -- if from lab-request flow
  attempted_slot text,      -- '6:00 AM'
  attempted_date date,
  required_tier text,
  shown_at timestamptz DEFAULT now(),
  converted boolean DEFAULT false,
  converted_at timestamptz
);
```

### Shared logic (`_shared/tier-gating.ts`)

```typescript
export type Tier = 'none' | 'regular_member' | 'vip' | 'concierge';

interface TierWindow {
  weekdayStart: number; weekdayEnd: number;  // hours (24h)
  saturdayStart: number | null; saturdayEnd: number | null;
  sundayAllowed: boolean;
  afterHoursAllowed: boolean;
}

const TIER_WINDOWS: Record<Tier, TierWindow> = {
  none: { weekdayStart: 9, weekdayEnd: 12, saturdayStart: null, saturdayEnd: null, sundayAllowed: false, afterHoursAllowed: false },
  regular_member: { weekdayStart: 6, weekdayEnd: 12, saturdayStart: 6, saturdayEnd: 9, sundayAllowed: false, afterHoursAllowed: false },
  vip: { weekdayStart: 6, weekdayEnd: 14, saturdayStart: 6, saturdayEnd: 11, sundayAllowed: false, afterHoursAllowed: false },
  concierge: { weekdayStart: 6, weekdayEnd: 20, saturdayStart: 6, saturdayEnd: 20, sundayAllowed: true, afterHoursAllowed: true },
};

// Returns the minimum tier that can access this slot
export function minTierForSlot(dateIso: string, time: string): Tier {
  for (const tier of ['none', 'regular_member', 'vip', 'concierge'] as Tier[]) {
    if (isSlotInTierWindow(tier, dateIso, time)) return tier;
  }
  return 'concierge'; // fallback — slot only available to top tier
}
```

### Wire into availability edge fn

`get-available-slots` + `get-lab-request-slots` return extra fields per slot:
```typescript
{
  time: '6:00 AM',
  available: true,
  requires_tier: 'regular_member',    // NEW
  unlock_price_dollars: 99,            // NEW
  visit_savings_dollars: 20,           // NEW (computed from service + tier discount)
}
```

Patient's current tier is determined by:
- Check `user_memberships` for active tier (if authenticated)
- Fall back to `none` for guest / non-member

### UI components

1. **Update `TimeSlotButton`** to render lock state with tier badge
2. **New `UnlockSlotModal`** — math card, one-click checkout
3. **New shared `useSlotLockAnalytics` hook** — fires `slot_lock_interactions` on display + click

### Checkout bundle (reuses existing `create-appointment-checkout`)

Already supports `subscribeToMembership` bundle mode. Just need to wire the "Unlock" button through to it with the right tier.

---

## Hormozi-grade UX details

1. **Show the LOCKED slots first, not last.** Gray them at the TOP of the grid so patients see the locked "premium" times before the available ones. Makes the value stack visible. (Current UX trend is to hide/demote — Hormozi says invert.)

2. **Color-code tiers.** Regular = amber, VIP = red, Concierge = purple. Consistent with membership marketing.

3. **Microcopy under locked slots:** *"Open seat — unlock with Regular"* (not "Member only"). Implies THE seat is there for them, just one step away.

4. **Countdown on first unlock.** After 30 seconds on the page without converting: *"⚡ Limited: 6 AM slots fill first. 2 available right now."* Creates perceived urgency.

5. **Never force-upgrade.** Always have the "pick an available slot instead" path. Friction kills conversion. Options > lock-ins.

6. **Social proof on the unlock modal.** *"47% of ConveLabs patients are members."*

7. **Post-unlock celebration.** When they join + book in the same flow, the success screen should have confetti + *"You just unlocked 6 AM slots forever. Welcome to the team."* Small delight = high referral likelihood.

8. **Member-only perks visible on dashboard** post-join. Dashboard shows *"Your unlocked hours: 6 AM – 12 PM weekdays · 6 AM – 9 AM Saturdays"* as a trophy. Reinforces the win they just earned.

---

## Redirect + flow gaps to handle

### Edge cases

1. **Lab-request patient (org-billed) who wants to upgrade for future visits** — shouldn't pay for this visit (org covers) but wants to join for personal future visits. Modal should detect `org.org_covers === true` and pivot:
   > *"This visit is covered by Elite Medical — no charge. Want to join Regular Member ($99/yr) for your OWN future labs? You'll save $X on the next one."*
   
2. **Patient already has a lower-tier membership** — show the UPGRADE price, not full price. *"You're Regular. Unlock 1 PM slots with VIP — upgrade for $100/yr."*

3. **Logged-out patient on `/book-now`** — can't check membership status. Option: assume `none` and ask *"Log in to see your member slots"* link near the grid. Or: tier gate applies from session start, they see locked; if they log in later, page refreshes to show unlocked.

4. **Patient abandons mid-unlock** — track in `slot_lock_interactions`, email them 24 hr later: *"You started an upgrade — still thinking? 6 AM is still available right now."*

5. **Partial membership (annual prepaid with remaining months)** — show *"Your VIP is active for 8 more months · unlock 1 PM slots through Dec 15."* Reinforces value of the existing spend.

6. **Existing appointment + post-booking upgrade** — patient realizes too late they could have gotten earlier hours. Post-booking nudge: *"Your visit is at 10 AM. Upgrade to Regular ($99/yr) and we'll move it to 8 AM — you'd save $20 today."*

### Analytics + optimization

- **Lock-to-book conversion rate** per tier — which tier has best unlock? Does VIP or Regular convert more?
- **Time-to-unlock decay** — after N seconds on page without unlock, convert rate drops. Find the knee.
- **Slot-specific conversion** — does 6 AM lock convert more than 1 PM lock? Price them differently.
- **Retention** — members who joined via unlock vs. via direct pricing page — which cohort retains longer?

---

## Build order

### Phase 1 — Core gating (1 session):
1. `_shared/tier-gating.ts` with TIER_WINDOWS + min-tier resolver
2. Update `_shared/availability.ts` to return `requires_tier` + `unlock_*` fields
3. Update `get-available-slots` + `get-lab-request-slots` to include tier data
4. Update `PatientLabRequestPage` + `DateTimeSelectionStep` (main booking) to render locked state
5. `UnlockSlotModal` component
6. Hook up to existing `create-appointment-checkout` bundle flow

### Phase 2 — Analytics + optimization:
7. `slot_lock_interactions` tracking
8. Admin dashboard card: "Lock conversion rate this month"
9. A/B-test copy variations (via simple feature flag)

### Phase 3 — Retention loops:
10. Post-booking upgrade nudge (if at 10 AM, suggest 8 AM after joining)
11. Member-status trophy on dashboard
12. Abandoned-unlock email sequence
