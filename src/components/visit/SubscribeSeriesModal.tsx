import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Calendar, Clock, MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';

/**
 * SUBSCRIBE SERIES MODAL — Tier 3 patient-facing subscription flow.
 *
 * Called from /visit/:token as a CTA after (or even before) the patient's
 * first visit. Captures frequency + day-of-week + time + address, kicks off
 * a Stripe subscription Checkout session, and returns the patient to a
 * success URL.
 *
 * Hormozi move: this is the quiet LTV compounder. One-off bookings = one
 * payment. Subscription = 12+ payments locked in + near-100% show rate +
 * near-zero acquisition cost for every visit after the first.
 */

interface Visit {
  id: string;
  patient_name: string;
  patient_email: string;
  patient_phone: string | null;
  service_type: string;
  service_name: string;
  address: string;
  zipcode: string;
  appointment_time: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  visit: Visit;
  userId?: string | null;
}

const FREQUENCY_OPTIONS = [
  { weeks: 4, label: 'Every month',    sublabel: 'Most popular' },
  { weeks: 8, label: 'Every 8 weeks',  sublabel: 'Biweekly labs' },
  { weeks: 12, label: 'Every quarter', sublabel: 'Annual physical pace' },
  { weeks: 24, label: 'Every 6 months', sublabel: 'Check-in cadence' },
];

const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// List prices per service_type — keep this roughly in sync with the server
// verifyMemberTier in create-appointment-checkout. Doesn't need to be exact;
// server authoritatively sets the subscription line-item price.
const SERVICE_LIST_PRICE_CENTS: Record<string, number> = {
  'mobile': 15000,
  'senior': 10000,
  'in-office': 5500,
  'therapeutic': 20000,
  'specialty-kit': 18500,
  'specialty-kit-genova': 20000,
};

const DISCOUNT_PCT = 15;

const SubscribeSeriesModal: React.FC<Props> = ({ open, onClose, visit, userId }) => {
  const [frequencyWeeks, setFrequencyWeeks] = useState<number>(4);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [preferredTime, setPreferredTime] = useState<string>(visit.appointment_time || '9:00 AM');
  const [startDate, setStartDate] = useState<string>(() => {
    // Default: 4 weeks from today
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [submitting, setSubmitting] = useState(false);

  const listPriceCents = SERVICE_LIST_PRICE_CENTS[visit.service_type] || 15000;
  const discountedCents = Math.round(listPriceCents * (1 - DISCOUNT_PCT / 100));
  const savingsCents = listPriceCents - discountedCents;

  const handleSubscribe = async () => {
    if (!visit.patient_email) {
      toast.error('We need your email on file to subscribe. Call us at (941) 527-9169.');
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-subscription-checkout', {
        body: {
          patientEmail: visit.patient_email,
          patientName: visit.patient_name,
          patientPhone: visit.patient_phone,
          serviceType: visit.service_type,
          serviceName: visit.service_name,
          frequencyWeeks,
          preferredDayOfWeek: dayOfWeek,
          preferredTime,
          preferredAddress: visit.address,
          preferredZip: visit.zipcode,
          perVisitPriceCents: listPriceCents,
          discountPercent: DISCOUNT_PCT,
          startDate,
          userId: userId || null,
        },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error('No checkout URL returned');
      window.location.href = url;
    } catch (e: any) {
      console.error('Subscribe error:', e);
      toast.error(e?.message || 'Subscription failed — please call us');
      setSubmitting(false);
    }
  };

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        {/* Hero */}
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 text-white px-6 py-6 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs uppercase tracking-wider font-semibold opacity-90">Subscribe & Save</span>
          </div>
          <DialogTitle className="text-xl font-bold leading-tight">
            Save {DISCOUNT_PCT}% on every visit — auto-scheduled.
          </DialogTitle>
          <DialogDescription className="text-sm text-white/85 mt-2 leading-relaxed">
            Pick your cadence. We handle the calendar, the reminders, and the draw.
            Pause or cancel anytime.
          </DialogDescription>
        </div>

        <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
          {/* Frequency */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2 block">How often?</Label>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCY_OPTIONS.map((f) => (
                <button
                  key={f.weeks}
                  type="button"
                  onClick={() => setFrequencyWeeks(f.weeks)}
                  className={`px-3 py-2.5 rounded-lg border text-left transition ${
                    frequencyWeeks === f.weeks
                      ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-200'
                      : 'bg-white border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  <div className="text-sm font-semibold text-gray-900">{f.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{f.sublabel}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Day of Week */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-2 block">
              Preferred day <span className="font-normal text-gray-400 normal-case">(optional)</span>
            </Label>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDayOfWeek(dayOfWeek === i ? null : i)}
                  className={`h-8 rounded-md text-[11px] font-semibold border transition ${
                    dayOfWeek === i
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Time */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">Preferred time</Label>
            <Input
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              placeholder="9:00 AM"
            />
          </div>

          {/* Start date */}
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-600 font-semibold mb-1 block">First recurring visit</Label>
            <Input
              type="date"
              value={startDate}
              min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">Default is 4 weeks from today — we'll auto-adjust to your chosen day of the week.</p>
          </div>

          {/* Address (read-only, from current visit) */}
          <div className="flex items-start gap-2 border rounded-lg p-2.5 bg-gray-50">
            <MapPin className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs min-w-0 flex-1">
              <p className="font-semibold text-gray-900">Same address each visit</p>
              <p className="text-gray-600 truncate">{visit.address}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">Call us to change between visits.</p>
            </div>
          </div>

          {/* Price */}
          <div className="border-2 border-emerald-200 bg-emerald-50 rounded-lg p-3">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold">Your price per visit</p>
                <p className="text-xs text-gray-500 line-through">{dollars(listPriceCents)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-700">{dollars(discountedCents)}</p>
                <p className="text-[10px] text-emerald-600">Save {dollars(savingsCents)}/visit</p>
              </div>
            </div>
            <p className="text-[11px] text-emerald-800 mt-2 leading-relaxed">
              Billed automatically every {frequencyWeeks} weeks. Pause or cancel anytime — you're not locked in.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 bg-white flex-shrink-0 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>Not now</Button>
          <Button
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-10 gap-1.5"
            disabled={submitting}
            onClick={handleSubscribe}
          >
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Starting checkout…</>
            ) : (
              <>Subscribe for {dollars(discountedCents)}/visit <ArrowRight className="h-4 w-4" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscribeSeriesModal;
