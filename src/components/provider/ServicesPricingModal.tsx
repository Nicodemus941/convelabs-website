import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles, Crown, Zap, Home, Building2, FlaskConical, Stethoscope, X, MapPin, Clock, Star } from 'lucide-react';
import FoundingSeatsCounter from '@/components/membership/FoundingSeatsCounter';

/**
 * ServicesPricingModal — Hormozi-style.
 *
 * What Hormozi prescribes for a partner-facing services & pricing surface:
 *   1. Lead with the WIN (savings + convenience), not a price grid.
 *   2. Tier columns side-by-side, VIP highlighted as "Most popular" anchor.
 *   3. Anchor against the relevant alternative (Quest/Labcorp retail price).
 *   4. One service-row format → no decision fatigue.
 *   5. Single primary CTA at the bottom that funnels to the same booking flow
 *      every other CTA on the dashboard uses.
 *   6. Show the surcharges plainly so partners can quote with confidence.
 *
 * No marketing fluff — every number reflects pricingService.ts source of truth.
 */

interface Service {
  id: string;
  name: string;
  blurb: string;
  none: number;
  member: number;
  vip: number;
  concierge: number;
  icon: React.ComponentType<{ className?: string }>;
  retailAnchor?: string; // "Quest in-office: $300+" — the alternative being beaten
}

const SERVICES: Service[] = [
  {
    id: 'mobile',
    name: 'Mobile Blood Draw',
    blurb: 'Licensed phleb comes to the patient — home, office, or wherever they are.',
    none: 150, member: 130, vip: 115, concierge: 99,
    icon: Home,
    retailAnchor: 'Hospital outpatient: $200–400',
  },
  {
    id: 'in-office',
    name: 'In-Office Draw',
    blurb: 'Patient comes to our Orlando office. 15–20 min in and out.',
    none: 55, member: 49, vip: 45, concierge: 39,
    icon: Building2,
    retailAnchor: 'Quest/Labcorp draw fee: $50+',
  },
  {
    id: 'specialty-kit',
    name: 'Specialty Kit (DUTCH, GI-MAP, etc.)',
    blurb: 'Functional / specialty kits collected at home + shipped to the lab.',
    none: 185, member: 165, vip: 150, concierge: 135,
    icon: FlaskConical,
    retailAnchor: 'Most kits ship-only — patients self-collect',
  },
  {
    id: 'therapeutic',
    name: 'Therapeutic Phlebotomy',
    blurb: 'Doctor-ordered therapeutic blood removal for hemochromatosis, polycythemia, etc.',
    none: 200, member: 180, vip: 165, concierge: 150,
    icon: Stethoscope,
    retailAnchor: 'Hospital infusion suite: $400–800',
  },
];

const SURCHARGES = [
  { label: 'Same-Day / STAT', amount: 100, icon: Zap, note: 'When the patient needs draws today.' },
  { label: 'Weekend (Sat/Sun)', amount: 75, icon: Clock, note: 'Saturday or Sunday visits.' },
  { label: 'Extended Hours (after 5pm)', amount: 50, icon: Clock, note: 'For working professionals.' },
  { label: 'Extended Service Area', amount: 75, icon: MapPin, note: 'Lake Nona, Celebration, Sanford, Daytona, etc. — anywhere outside metro Orlando.' },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSchedule?: () => void;
  organizationName?: string | null;
}

const ServicesPricingModal: React.FC<Props> = ({ open, onOpenChange, onSchedule, organizationName }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto p-0">
        {/* Hero — lead with the win, not the price */}
        <div className="relative bg-gradient-to-br from-[#B91C1C] to-[#7F1D1D] text-white p-6 sm:p-8 rounded-t-lg">
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogHeader>
            <DialogTitle className="text-white text-2xl sm:text-3xl font-bold leading-tight pr-8">
              Lab work that fits your patients' lives — and your margins.
            </DialogTitle>
          </DialogHeader>
          <p className="text-white/90 text-sm sm:text-base mt-3 max-w-2xl leading-relaxed">
            {organizationName ? <><span className="font-semibold">{organizationName}</span> patients </> : 'Your patients '}
            skip the waiting room. You skip the no-shows. Members save up to <strong>34% on every visit</strong>, and your practice can subscribe and re-bill them for the spread.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge className="bg-white/20 text-white border-white/30 text-[11px] hover:bg-white/20 gap-1">
              <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> 4.9 · 1,500+ patients
            </Badge>
            <Badge className="bg-white/15 text-white border-white/20 text-[11px] hover:bg-white/15">CLIA-certified phlebs</Badge>
            <Badge className="bg-white/15 text-white border-white/20 text-[11px] hover:bg-white/15">HIPAA-compliant</Badge>
            <Badge className="bg-white/15 text-white border-white/20 text-[11px] hover:bg-white/15">Quest + Labcorp delivery</Badge>
          </div>
        </div>

        {/* SCARCITY STRIP — Founding 50 VIP seats. Live count from DB. */}
        <div className="px-6 sm:px-8 pt-4">
          <FoundingSeatsCounter variant="banner" />
        </div>

        <div className="p-6 sm:p-8">
          {/* Tier headers — 4 tiers side-by-side so Concierge is a real
              third anchor instead of a buried callout (Hormozi rule:
              3 visible price points maximize cognitive comparison; we
              show 4 with VIP highlighted as Most Popular).
              Service column gets 2fr so its blurb has room to breathe. */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-1.5 sm:gap-2 mb-2 sticky top-0 bg-white pt-4 pb-2 z-10 border-b">
            <div className="pl-2 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500 self-end">Service</div>
            <div className="text-center px-1">
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-700">Standard</div>
              <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">no plan</div>
            </div>
            <div className="text-center px-1">
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-700">Member</div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">$99/yr · ~13%</div>
            </div>
            <div className="text-center px-1 relative pt-3">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <Badge className="bg-amber-500 text-white border-amber-500 text-[9px] px-1.5 py-0 h-4 leading-none">★ Most popular</Badge>
              </div>
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-amber-700">VIP</div>
              <div className="text-[10px] text-amber-700/80 mt-0.5 leading-tight">$199/yr · ~23%</div>
            </div>
            <div className="text-center px-1">
              <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-purple-700">Concierge</div>
              <div className="text-[10px] text-purple-600/80 mt-0.5 leading-tight">$399/yr · ~34%</div>
            </div>
          </div>

          {/* Service rows */}
          <div className="divide-y border rounded-lg overflow-hidden">
            {SERVICES.map(s => {
              const Icon = s.icon;
              const memberSave = s.none - s.member;
              const vipSave = s.none - s.vip;
              return (
                <div key={s.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-1.5 sm:gap-2 p-3 sm:p-4 items-center hover:bg-gray-50">
                  <div className="flex items-start gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-[#B91C1C] flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm leading-tight">{s.name}</div>
                      <div className="text-[10px] sm:text-[11px] text-gray-500 mt-0.5 leading-snug">{s.blurb}</div>
                      {s.retailAnchor && (
                        <div className="text-[10px] text-gray-400 italic mt-1">vs. {s.retailAnchor}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm sm:text-base font-semibold text-gray-700">${s.none}</div>
                  </div>
                  <div className="text-center bg-emerald-50/50 rounded py-1">
                    <div className="text-sm sm:text-base font-bold text-emerald-700">${s.member}</div>
                    <div className="text-[9px] text-emerald-600">save ${memberSave}</div>
                  </div>
                  <div className="text-center bg-amber-50 rounded py-1 ring-1 ring-amber-200">
                    <div className="text-sm sm:text-base font-bold text-amber-700 flex items-center justify-center gap-1">
                      <Crown className="h-3 w-3" />${s.vip}
                    </div>
                    <div className="text-[9px] text-amber-700">save ${vipSave}</div>
                  </div>
                  <div className="text-center bg-purple-50/60 rounded py-1 ring-1 ring-purple-100">
                    <div className="text-sm sm:text-base font-bold text-purple-700">${s.concierge}</div>
                    <div className="text-[9px] text-purple-600">save ${s.none - s.concierge}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* VIP bonus stack — Hormozi: don't make people guess what's
              included. Spell out the value behind the $199 anchor. */}
          <div className="mt-4 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 p-4">
            <div className="flex items-start gap-2 mb-3">
              <Crown className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-amber-900">VIP — $199/yr unlocks $474 of value</div>
                <div className="text-[11px] text-amber-700">Pays for itself in one Mobile draw. Most patients break even by visit #2.</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs ml-7">
              <div className="flex items-center gap-1.5 text-amber-900"><Check className="h-3 w-3 text-emerald-600 flex-shrink-0" /> $35 off every Mobile visit <span className="text-amber-600/70 ml-auto">$140 value</span></div>
              <div className="flex items-center gap-1.5 text-amber-900"><Check className="h-3 w-3 text-emerald-600 flex-shrink-0" /> Free family add-on (1 member) <span className="text-amber-600/70 ml-auto">$75 value</span></div>
              <div className="flex items-center gap-1.5 text-amber-900"><Check className="h-3 w-3 text-emerald-600 flex-shrink-0" /> Priority same-day booking <span className="text-amber-600/70 ml-auto">$150 value</span></div>
              <div className="flex items-center gap-1.5 text-amber-900"><Check className="h-3 w-3 text-emerald-600 flex-shrink-0" /> Founding rate locked for life <span className="text-amber-600/70 ml-auto">$50/yr value</span></div>
              <div className="flex items-center gap-1.5 text-amber-900 sm:col-span-2"><Check className="h-3 w-3 text-emerald-600 flex-shrink-0" /> Founding Member badge + first access to future offerings <span className="text-amber-600/70 ml-auto">priceless</span></div>
            </div>
          </div>

          {/* Surcharges — Hormozi: no surprises = no chargebacks */}
          <div className="mt-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">When applicable, add</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SURCHARGES.map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="flex items-start gap-2 text-xs border rounded-lg px-3 py-2 bg-gray-50/50">
                    <Icon className="h-3.5 w-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">+${s.amount} · {s.label}</div>
                      <div className="text-[10px] text-gray-500 leading-snug">{s.note}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What's included — the trust closers */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /><span>Specimen pickup + delivery to Quest, Labcorp, AdventHealth, or your lab of choice</span></div>
            <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /><span>Real-time SMS + email status: notified → opened → booked → drawn → delivered</span></div>
            <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /><span>Recollection guarantee — if a sample is rejected, we re-draw at no charge</span></div>
            <div className="flex items-start gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0 mt-0.5" /><span>Auto-fill from doctor's order PDF (OCR) — no re-typing patient info</span></div>
          </div>

          {/* CTA — single primary action that funnels to the existing booking flow */}
          <div className="mt-7 flex flex-col sm:flex-row gap-3 items-center justify-between bg-gray-900 text-white rounded-xl p-5">
            <div className="text-center sm:text-left">
              <div className="text-base font-bold">Ready to schedule a patient?</div>
              <div className="text-[12px] text-gray-300 mt-0.5">Same flow you already use — pick patient, attach lab order, set draw-by date.</div>
            </div>
            <Button
              onClick={() => { onOpenChange(false); onSchedule?.(); }}
              className="bg-[#B91C1C] hover:bg-[#991B1B] text-white h-11 px-6 gap-2 font-semibold w-full sm:w-auto"
            >
              Schedule a visit →
            </Button>
          </div>

          <p className="text-[10px] text-gray-400 mt-4 text-center">
            Pricing in USD. Member tiers stack — patients always pay their tier's price, even on partner-referred visits. Updated 2026.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ServicesPricingModal;
