import {
  PREMIUM_FEE_CENTS,
  VIP_HOLD_LABEL,
  evaluateSlot,
  isBookingAllowed,
  premiumFeeCents,
  slotStartUtcMs,
  todayIsoET,
} from '../bookingWindows';

// 2026-10-06 is a Tuesday, 2026-10-10 a Saturday.
const TUE = '2026-10-06';
const SAT = '2026-10-10';
// "now" relative to the Saturday 8 AM ET slot (12:00 UTC during EDT).
const SAT_8AM_UTC = slotStartUtcMs(SAT, '08:00');
const H = 3600 * 1000;
const threeDaysOut = new Date(SAT_8AM_UTC - 72 * H);
const twentyHoursOut = new Date(SAT_8AM_UTC - 20 * H);

describe('weekday premium hours', () => {
  it('non-member fasting 10:00 Tue → allowed, standard, no fee', () => {
    const r = evaluateSlot({ tier: 'none', dateIso: TUE, time: '10:00 AM', isFasting: true });
    expect(r.bookable).toBe(true);
    expect(r.window).toBe('standard');
    expect(r.feeCents).toBe(0);
  });

  it('non-member 06:00 Tue → allowed, +$10', () => {
    const r = evaluateSlot({ tier: 'none', dateIso: TUE, time: '6:00 AM', isFasting: false });
    expect(r.bookable).toBe(true);
    expect(r.window).toBe('premium');
    expect(r.feeCents).toBe(PREMIUM_FEE_CENTS);
  });

  it('every paid member at 06:00 → $0', () => {
    for (const tier of ['member', 'vip', 'concierge'] as const) {
      const r = evaluateSlot({ tier, dateIso: TUE, time: '06:00', isFasting: true });
      expect(r.bookable).toBe(true);
      expect(r.feeCents).toBe(0);
      expect(r.premiumEligible).toBe(true);
    }
  });

  it('fasting 12:30 → not allowed; non-fasting 12:30 → standard', () => {
    expect(evaluateSlot({ tier: 'vip', dateIso: TUE, time: '12:30 PM', isFasting: true }).bookable).toBe(false);
    const nf = evaluateSlot({ tier: 'none', dateIso: TUE, time: '12:30 PM', isFasting: false });
    expect(nf.bookable).toBe(true);
    expect(nf.window).toBe('standard');
  });

  it('14:30 non-member → +$10 (the old VIP-only hour is gone)', () => {
    const r = evaluateSlot({ tier: 'none', dateIso: TUE, time: '2:30 PM', isFasting: false });
    expect(r.bookable).toBe(true);
    expect(r.feeCents).toBe(PREMIUM_FEE_CENTS);
    expect(r.vipHold).toBe(false);
  });

  it('15:00 and 04:45 are outside the window', () => {
    expect(evaluateSlot({ tier: 'concierge', dateIso: TUE, time: '3:00 PM', isFasting: false }).bookable).toBe(false);
    expect(evaluateSlot({ tier: 'concierge', dateIso: TUE, time: '4:45 AM', isFasting: false }).bookable).toBe(false);
  });
});

describe('weekend VIP hold + 24 h release', () => {
  it('non-member Sat 08:00 at 3 days out → VIP hold, not bookable, labelled', () => {
    const r = evaluateSlot({ tier: 'none', dateIso: SAT, time: '8:00 AM', isFasting: false, now: threeDaysOut });
    expect(r.bookable).toBe(false);
    expect(r.vipHold).toBe(true);
    expect(r.reason).toBe(VIP_HOLD_LABEL);
    expect(r.releaseAt).toBe(new Date(SAT_8AM_UTC - 24 * H).toISOString());
  });

  it('non-member Sat 08:00 at 20 h out → bookable, +$10', () => {
    const r = evaluateSlot({ tier: 'none', dateIso: SAT, time: '8:00 AM', isFasting: false, now: twentyHoursOut });
    expect(r.bookable).toBe(true);
    expect(r.vipHold).toBe(false);
    expect(r.feeCents).toBe(PREMIUM_FEE_CENTS);
  });

  it('Regular member Sat at 20 h → $0; at 3 days → still held', () => {
    expect(evaluateSlot({ tier: 'member', dateIso: SAT, time: '8:00 AM', isFasting: false, now: twentyHoursOut }).feeCents).toBe(0);
    expect(evaluateSlot({ tier: 'member', dateIso: SAT, time: '8:00 AM', isFasting: false, now: threeDaysOut }).bookable).toBe(false);
  });

  it('VIP / Concierge Sat → bookable any time, $0', () => {
    for (const tier of ['vip', 'concierge'] as const) {
      const r = evaluateSlot({ tier, dateIso: SAT, time: '8:00 AM', isFasting: false, now: threeDaysOut });
      expect(r.bookable).toBe(true);
      expect(r.feeCents).toBe(0);
    }
  });

  it('weekend 11:00 is closed for everyone', () => {
    expect(evaluateSlot({ tier: 'concierge', dateIso: SAT, time: '11:00 AM', isFasting: false }).bookable).toBe(false);
  });
});

describe('fee precedence (never stack)', () => {
  it('premium fee not added when the same-day fee applies', () => {
    expect(premiumFeeCents({ tier: 'none', dateIso: TUE, time: '6:00 AM', sameDayFeeApplies: true })).toBe(0);
    expect(premiumFeeCents({ tier: 'none', dateIso: TUE, time: '6:00 AM' })).toBe(PREMIUM_FEE_CENTS);
  });

  it('premium fee not added when the after-hours surcharge applies', () => {
    expect(premiumFeeCents({ tier: 'none', dateIso: TUE, time: '6:00 AM', afterHoursFeeApplies: true })).toBe(0);
  });

  it('members never pay the premium fee', () => {
    expect(premiumFeeCents({ tier: 'member', dateIso: TUE, time: '2:00 PM' })).toBe(0);
  });
});

describe('compat + helpers', () => {
  it('isBookingAllowed suggests weekday alternatives for a fasting afternoon', () => {
    const r = isBookingAllowed({ tier: 'none', dateIso: TUE, time: '1:00 PM', isFasting: true });
    expect(r.allowed).toBe(false);
    expect(r.suggestions[0]).toBe('5:00 AM');
  });

  it('todayIsoET shifts the UTC date back to Eastern', () => {
    expect(todayIsoET(new Date('2026-10-07T03:30:00Z'))).toBe('2026-10-06');
  });
});
