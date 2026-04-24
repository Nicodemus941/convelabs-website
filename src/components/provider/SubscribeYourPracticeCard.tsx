import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Crown, TrendingUp, Sparkles, Loader2, Check } from 'lucide-react';

/**
 * SubscribeYourPracticeCard — provider-dashboard enrollment CTA.
 *
 * Pricing: $85/patient/month. Provider picks estimated volume; total
 * = per_seat × seat_cap. Stripe Checkout in subscription mode via
 * create-org-subscription-checkout edge fn.
 *
 * Value framing: "Cover N patients for $X/mo. Re-bill each patient
 * $Y/mo through your practice membership and pocket the spread."
 *
 * Hide this card when subscription_status === 'active'. ProviderDashboard
 * is responsible for showing a different "Manage subscription" card in
 * that case.
 */

const PER_SEAT_CENTS = 8500; // $85/patient/month

interface Plan {
  seats: number;
  label: string;
  subtext: string;
  accent?: boolean;
}

const PRESETS: Plan[] = [
  { seats: 10, label: 'Starter', subtext: 'Small practices testing the workflow' },
  { seats: 25, label: 'Growth', subtext: 'Best fit for most practices', accent: true },
  { seats: 50, label: 'Scale', subtext: 'High-volume practices + specialty' },
  { seats: 100, label: 'Enterprise', subtext: 'Multi-provider + multi-location' },
];

interface Props {
  orgName: string;
}

const SubscribeYourPracticeCard: React.FC<Props> = ({ orgName }) => {
  const [pick, setPick] = useState<number>(25);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('30');
  const [submitting, setSubmitting] = useState(false);

  const activeSeats = customMode ? Math.max(5, Math.min(500, parseInt(customValue, 10) || 0)) : pick;
  const monthlyCents = activeSeats * PER_SEAT_CENTS;
  const patientResaleExample = Math.ceil((PER_SEAT_CENTS * 1.12) / 100); // suggest a ~12% markup
  const practiceProfit = ((patientResaleExample * 100 - PER_SEAT_CENTS) * activeSeats) / 100;

  const subscribe = async () => {
    if (!Number.isFinite(activeSeats) || activeSeats < 5 || activeSeats > 500) {
      toast.error('Pick between 5 and 500 patients');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-org-subscription-checkout', {
        body: { seat_cap: activeSeats },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error);
      const url = (data as any)?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not start subscription');
      setSubmitting(false);
    }
  };

  return (
    <Card className="shadow-sm border-2 border-[#B91C1C]/30 bg-gradient-to-br from-red-50/40 via-white to-white">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Crown className="h-5 w-5 text-[#B91C1C]" />
          <CardTitle className="text-lg">Subscribe your practice</CardTitle>
          <Badge variant="outline" className="bg-[#B91C1C] text-white border-[#B91C1C] text-[10px]">
            New
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Cover your patients' at-home draws on one monthly bill. Re-bill each patient through your own practice membership and keep the spread.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Preset cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map(p => {
            const selected = !customMode && pick === p.seats;
            const price = (p.seats * PER_SEAT_CENTS) / 100;
            return (
              <button
                key={p.seats}
                type="button"
                onClick={() => { setPick(p.seats); setCustomMode(false); }}
                className={`text-left rounded-lg p-3 border-2 transition ${
                  selected
                    ? 'border-[#B91C1C] bg-white shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-400'
                } ${p.accent && !selected ? 'ring-1 ring-amber-300' : ''}`}
              >
                {p.accent && !selected && (
                  <div className="mb-1">
                    <Badge variant="outline" className="bg-amber-50 border-amber-300 text-amber-800 text-[9px]">
                      Recommended
                    </Badge>
                  </div>
                )}
                <p className="text-xs font-semibold text-gray-900">{p.label}</p>
                <p className="text-lg font-bold text-[#B91C1C] mt-1">${price.toLocaleString()}<span className="text-[10px] text-gray-500 font-normal">/mo</span></p>
                <p className="text-[10px] text-gray-500 mt-0.5">{p.seats} patients</p>
                {selected && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#B91C1C] font-semibold">
                    <Check className="h-2.5 w-2.5" /> Selected
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom */}
        <div className="flex items-center gap-2 flex-wrap bg-gray-50 border rounded-lg p-3">
          <Label className="text-xs font-semibold flex items-center gap-1">
            <input
              type="radio"
              checked={customMode}
              onChange={() => setCustomMode(true)}
              className="h-4 w-4"
            />
            Custom volume
          </Label>
          <Input
            type="number"
            min={5}
            max={500}
            value={customValue}
            onChange={(e) => { setCustomValue(e.target.value); setCustomMode(true); }}
            className="h-9 w-24 text-sm"
            placeholder="Patients"
          />
          <span className="text-sm text-gray-600">patients</span>
          {customMode && (
            <span className="text-sm font-semibold text-[#B91C1C] ml-auto">
              = ${(monthlyCents / 100).toLocaleString()}/mo
            </span>
          )}
        </div>

        {/* Value stack + profit preview */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-2" style={{ fontFamily: 'Georgia, serif' }}>
            Your math at {activeSeats} patients
          </p>
          <div className="space-y-1.5 text-sm text-emerald-900">
            <div className="flex items-center justify-between">
              <span>Your cost to ConveLabs</span>
              <span className="font-semibold">${(monthlyCents / 100).toLocaleString()}/mo</span>
            </div>
            <div className="flex items-center justify-between">
              <span>If you re-bill each patient <strong>${patientResaleExample}/mo</strong></span>
              <span className="font-semibold">${(patientResaleExample * activeSeats).toLocaleString()}/mo</span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-emerald-200">
              <span className="font-bold">Your practice profit</span>
              <span className="font-bold text-emerald-700">+${practiceProfit.toLocaleString()}/mo</span>
            </div>
          </div>
          <p className="text-[11px] text-emerald-800 mt-2 leading-relaxed">
            Most practices mark up 10–20% and bundle at-home draws into their own membership. Your math; your pricing.
          </p>
        </div>

        {/* Value stack bullets */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">What's included</p>
          {[
            `Covers up to ${activeSeats} enrolled patients`,
            'Unlimited at-home blood draws for enrolled patients',
            'Priority scheduling for your practice',
            'Concierge-tier service level',
            'One monthly invoice to your practice',
            'Cancel or adjust seats anytime',
          ].map(line => (
            <div key={line} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span>{line}</span>
            </div>
          ))}
        </div>

        <Button
          onClick={subscribe}
          disabled={submitting}
          className="w-full bg-[#B91C1C] hover:bg-[#991B1B] text-white h-12 text-sm font-bold gap-1.5"
        >
          {submitting ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Opening Stripe…</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Subscribe — ${(monthlyCents / 100).toLocaleString()}/mo</>
          )}
        </Button>
        <p className="text-[11px] text-center text-gray-500">
          Secure checkout via Stripe. Cancel anytime from your dashboard.
        </p>
      </CardContent>
    </Card>
  );
};

export default SubscribeYourPracticeCard;
