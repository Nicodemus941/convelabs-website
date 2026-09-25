import { orgDrawPricing } from '../orgDrawPricing';

describe('orgDrawPricing', () => {
  // The practice said it plainly: $72.25 for one patient, $144.50 for two.
  const ELITE = 72.25;

  it('charges the agreed rate for a single patient', () => {
    const p = orgDrawPricing(ELITE, 0, 0);
    expect(p.finalPrice).toBeCloseTo(72.25, 2);
    expect(p.primaryTotal).toBeCloseTo(72.25, 2);
    expect(p.companionChargeTotal).toBe(0);
  });

  it('charges it again for a family member, not a companion rate', () => {
    const p = orgDrawPricing(ELITE, 0, 1);
    expect(p.finalPrice).toBeCloseTo(144.50, 2);
    // What went wrong: $69.50 on the primary and $75.00 on the companion.
    expect(p.primaryTotal).toBeCloseTo(72.25, 2);
    expect(p.companionAmount).toBeCloseTo(72.25, 2);
    // The rows must add up to the visit, or the invoice double-bills or drops.
    expect(p.primaryTotal + p.companionChargeTotal).toBeCloseTo(p.finalPrice, 2);
  });

  it('keeps adding up for a bigger household', () => {
    const p = orgDrawPricing(ELITE, 0, 3);
    expect(p.finalPrice).toBeCloseTo(289.00, 2);
    expect(p.primaryTotal + p.companionChargeTotal).toBeCloseTo(p.finalPrice, 2);
  });

  it('charges the visit surcharge once, on the primary, not per person', () => {
    const p = orgDrawPricing(ELITE, 25, 1);
    expect(p.primaryTotal).toBeCloseTo(97.25, 2);
    expect(p.companionAmount).toBeCloseTo(72.25, 2);
    expect(p.finalPrice).toBeCloseTo(169.50, 2);
    expect(p.primaryTotal + p.companionChargeTotal).toBeCloseTo(p.finalPrice, 2);
  });
});
