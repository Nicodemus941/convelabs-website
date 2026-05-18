import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TipSelectorProps {
  value: number;
  onChange: (amount: number) => void;
  /**
   * Visit subtotal (dollars). When provided, the preset buttons become
   * percentage-based (15% / 20% / 25%) which is a stronger anchor than
   * the old flat-dollar presets — a $200 therapeutic patient who wants to
   * tip 15% used to have to type $30 in Custom. Plus we use it to derive
   * a sensible max-tip cap.
   */
  visitSubtotal?: number;
}

// Hormozi anchor: percentage presets feel native (every restaurant uses
// them), feel proportional to the visit cost, and avoid the cognitive
// load of "is $5 enough for a $200 visit?". 100% of tip goes to the phleb.
const PERCENT_PRESETS = [15, 20, 25];
// Max-tip safety net — Stripe rejects very large unit_amounts and
// patients sometimes fat-finger an extra zero ("$200" → "$2000"). Cap at
// 200% of the visit cost OR $1000, whichever is smaller. Trigger a
// gentle warning rather than silently clamping.
const HARD_MAX = 1000;

const TipSelector: React.FC<TipSelectorProps> = ({ value, onChange, visitSubtotal }) => {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const sub = Math.max(0, Number(visitSubtotal) || 0);
  const usePercentage = sub > 0;
  // Round to nearest dollar so the presets read cleanly. Tipping $43.50 is
  // a less satisfying tap than $44 — and the cents difference doesn't
  // change the phleb's take meaningfully.
  const presetAmounts: { label: string; amount: number }[] = usePercentage
    ? PERCENT_PRESETS.map(pct => ({ label: `${pct}% ($${Math.round(sub * pct / 100)})`, amount: Math.round(sub * pct / 100) }))
    : [5, 10, 15, 20].map(amount => ({ label: `$${amount}`, amount }));

  const maxAllowedTip = usePercentage ? Math.min(HARD_MAX, sub * 2) : HARD_MAX;
  const overMax = value > maxAllowedTip;

  const handlePreset = (amount: number) => {
    setShowCustom(false);
    setCustomValue('');
    onChange(amount);
  };

  const handleNoTip = () => {
    setShowCustom(false);
    setCustomValue('');
    onChange(0);
  };

  const handleCustomClick = () => {
    setShowCustom(true);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip everything except digits + ONE decimal point. Pre-fix the
    // regex allowed "1.5.5" — could produce NaN downstream.
    let raw = e.target.value.replace(/[^0-9.]/g, '');
    const firstDot = raw.indexOf('.');
    if (firstDot >= 0) raw = raw.slice(0, firstDot + 1) + raw.slice(firstDot + 1).replace(/\./g, '');
    setCustomValue(raw);
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) { onChange(0); return; }
    // Two-decimal-place precision; clamp to HARD_MAX so a "$2000" fat-finger
    // doesn't reach Stripe.
    const clamped = Math.min(Math.round(parsed * 100) / 100, HARD_MAX);
    onChange(clamped);
  };

  const isPresetSelected = (amount: number) =>
    !showCustom && value === amount;

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground">
        Add a tip for your phlebotomist <span className="text-xs text-emerald-700">(100% goes to them)</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {presetAmounts.map((p) => (
          <Button
            key={p.amount}
            type="button"
            variant={isPresetSelected(p.amount) ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(p.amount)}
            className="min-w-[60px]"
          >
            {p.label}
          </Button>
        ))}
        <Button
          type="button"
          variant={showCustom ? 'default' : 'outline'}
          size="sm"
          onClick={handleCustomClick}
        >
          Custom
        </Button>
        <Button
          type="button"
          variant={!showCustom && value === 0 ? 'default' : 'ghost'}
          size="sm"
          onClick={handleNoTip}
          className="text-muted-foreground"
        >
          No tip
        </Button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 max-w-[200px]">
          <span className="text-sm font-medium">$</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={customValue}
            onChange={handleCustomChange}
            autoFocus
            className="h-9"
          />
        </div>
      )}

      {value > 0 && !overMax && (
        <p className="text-sm text-muted-foreground">
          Tip: <span className="font-semibold text-foreground">${value.toFixed(2)}</span>
        </p>
      )}
      {overMax && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          ⚠ That's more than 2× the visit cost. Did you mean ${(value / 10).toFixed(2)}? Tap a preset or adjust.
        </p>
      )}
    </div>
  );
};

export default TipSelector;
