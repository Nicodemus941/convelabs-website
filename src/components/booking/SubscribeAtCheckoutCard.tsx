import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Check, X, ChevronDown, ChevronUp, Crown, Star, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import MembershipAgreementDialog from '@/components/membership/MembershipAgreementDialog';
import FoundingSeatsCounter from '@/components/membership/FoundingSeatsCounter';
import { getServicePrice } from '@/services/pricing/pricingService';

/**
 * SUBSCRIBE-AT-CHECKOUT CARD — inline Hormozi upsell surface on the booking flow.
 *
 * Patient is already pulling out their card to pay for a $150 draw. We show
 * a right-sized comparison: "Add VIP membership — this draw costs $115 instead
 * of $150. Your 12 months of priority access costs $199 total, billed once."
 *
 * Tapping "Add VIP" opens the Membership Agreement Dialog, and on agree:
 *   1. Write agreement row to membership_agreements (paper trail)
 *   2. Pass agreement_id + subscribeToMembership block into the checkout
 *      (BookingFlow forwards it to create-appointment-checkout which creates
 *      a Stripe Subscription session that INCLUDES the visit line + the
 *      annual membership line in one payment).
 *
 * Shown only to non-members (checked via patient email match against
 * user_memberships). Members see the auto-applied discount instead.
 */

interface Props {
  patientEmail: string;
  patientName: string;
  serviceType: string;
  serviceBaseCents: number;
  /** Called when the patient agrees to subscribe — parent should bundle the
   *  subscribeToMembership block into its create-appointment-checkout call. */
  onSubscribed: (payload: {
    planName: 'Regular' | 'VIP' | 'Concierge';
    annualPriceCents: number;
    agreementId: string;
    discountedServiceCents: number;
    memberTierAfter: 'member' | 'vip' | 'concierge';
  }) => void;
}

// Pricing comes from canonical pricingService — see audit 2026-04-28.
// Local table here only covered 6 services and missed all 5 partner orgs;
// member upsell wasn't quoting correct savings on partner-routed bookings.

const TIERS = [
  { planName: 'Regular' as const, shortName: 'Regular', key: 'member' as const, annualCents: 9900, color: 'emerald', icon: Sparkles },
  { planName: 'VIP' as const, shortName: 'VIP',  key: 'vip' as const, annualCents: 19900, color: 'red', icon: Star,     popular: true },
  { planName: 'Concierge' as const, shortName: 'Concierge', key: 'concierge' as const, annualCents: 39900, color: 'amber', icon: Crown },
];

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const SubscribeAtCheckoutCard: React.FC<Props> = ({ patientEmail, patientName, serviceType, serviceBaseCents, onSubscribed }) => {
  const [expanded, setExpanded] = useState(false);
  const [selectedTier, setSelectedTier] = useState<typeof TIERS[number] | null>(null);
  const [submittingAgreement, setSubmittingAgreement] = useState(false);

  // Calculate savings per tier for this specific visit. Uses pricingService
  // as the single source of truth — handles all 11 services + 5 partner orgs
  // uniformly, so partner-referred patients see correct upsell savings.
  const savings = useMemo(() => {
    return TIERS.map((t) => {
      const tierDollars = getServicePrice(serviceType, t.key);
      const thisVisitCents = Math.round(tierDollars * 100);
      const savedOnThisVisit = Math.max(0, serviceBaseCents - thisVisitCents);
      return {
        ...t,
        thisVisitCents,
        savingsThisVisit: savedOnThisVisit,
      };
    });
  }, [serviceType, serviceBaseCents]);

  const handleAgreed = async (tier: typeof TIERS[number], meta: { agreementVersion: string; agreementSha: string }) => {
    setSubmittingAgreement(true);
    try {
      // Write the signed agreement — exact same pattern as /pricing page
      const { data: agreement, error } = await supabase
        .from('membership_agreements' as any)
        .insert({
          user_email: patientEmail.toLowerCase(),
          user_name: patientName || null,
          plan_name: tier.planName,
          plan_annual_price_cents: tier.annualCents,
          billing_frequency: 'annual',
          agreement_version: meta.agreementVersion,
          agreement_text_sha256: meta.agreementSha,
          user_agent: navigator.userAgent,
        })
        .select()
        .single();
      if (error) throw error;

      const discountedCents = serviceBaseCents - savings.find(s => s.key === tier.key)!.savingsThisVisit;
      onSubscribed({
        planName: tier.planName,
        annualPriceCents: tier.annualCents,
        agreementId: (agreement as any).id,
        discountedServiceCents: discountedCents,
        memberTierAfter: tier.key,
      });
      setSelectedTier(null);
      toast.success(`${tier.planName} membership added — you save ${dollars(savings.find(s => s.key === tier.key)!.savingsThisVisit)} on today's visit.`);
    } catch (e: any) {
      console.error('[subscribe-at-checkout] failed:', e);
      toast.error(e?.message || 'Failed to start membership. Please try again.');
    } finally {
      setSubmittingAgreement(false);
    }
  };

  return (
    <>
      <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-white">
        <CardContent className="p-4">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">
                  Save up to {dollars(savings[2].savingsThisVisit)} on today's visit
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Add an annual membership at checkout → this visit is discounted + 12 months of priority.
                </p>
              </div>
            </div>
            {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>

          {expanded && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Pick a tier — one-time checkout bundles it with your visit</p>
              {savings.map((t) => {
                const TierIcon = t.icon;
                const colorClass = t.color === 'emerald' ? 'border-emerald-300 hover:bg-emerald-50' : t.color === 'red' ? 'border-[#B91C1C]/30 hover:bg-red-50' : 'border-amber-300 hover:bg-amber-50';
                const textColor = t.color === 'emerald' ? 'text-emerald-700' : t.color === 'red' ? 'text-[#B91C1C]' : 'text-amber-700';
                return (
                  <button
                    key={t.planName}
                    type="button"
                    onClick={() => setSelectedTier(t)}
                    disabled={submittingAgreement}
                    className={`w-full text-left border rounded-lg p-3 transition ${colorClass} ${(t as any).popular ? 'ring-2 ring-[#B91C1C]/10' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <TierIcon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${textColor}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold ${textColor}`}>
                            Add {t.planName} Annual · {dollars(t.annualCents)}/yr
                            {(t as any).popular && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-[#B91C1C] text-white">Most Popular</span>}
                          </p>
                          {/* Founding 50 scarcity pill — only on VIP tile */}
                          {t.key === 'vip' && (
                            <div className="mt-1">
                              <FoundingSeatsCounter variant="pill" />
                            </div>
                          )}
                          <p className="text-xs text-gray-600 mt-0.5">
                            This visit: <span className="line-through text-gray-400">{dollars(serviceBaseCents)}</span>{' '}
                            <strong className="text-gray-900">{dollars(t.thisVisitCents)}</strong>
                            <span className="text-emerald-700 font-semibold"> (save {dollars(t.savingsThisVisit)})</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <p className="text-[11px] text-gray-500 pt-1 flex items-start gap-1.5">
                <Shield className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>30-day full refund. After 30 days non-refundable <strong>except</strong> if you haven't used any benefits yet. Once you redeem today's discount, the annual commitment is locked in.</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreement dialog fires when a tier is picked */}
      {selectedTier && (
        <MembershipAgreementDialog
          open={!!selectedTier}
          onClose={() => setSelectedTier(null)}
          tier={{ name: selectedTier.planName, planName: selectedTier.planName, annualPrice: selectedTier.annualCents / 100 }}
          onAgreed={(meta) => handleAgreed(selectedTier, meta)}
          submitting={submittingAgreement}
        />
      )}
    </>
  );
};

export default SubscribeAtCheckoutCard;
