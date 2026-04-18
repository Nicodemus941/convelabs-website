import React, { useState } from 'react';
import { Check, X, Crown, Sparkles, Shield, Clock, Calendar as CalIcon, Users, Gift, Loader2, ArrowRight, AlertTriangle, Heart, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Header from '@/components/home/Header';
import Footer from '@/components/home/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import MembershipAgreementDialog from '@/components/membership/MembershipAgreementDialog';

/**
 * PRICING PAGE — Hormozi-structured 4-tier annual offer.
 *
 * Annual-only billing. Booking windows tier the scarce morning fasting slots.
 * Every tier shows what's NOT included (honest positioning builds trust).
 *
 * Flow:
 *   1. Patient picks a tier → MembershipAgreementDialog opens
 *   2. Patient reviews terms + no-refund-after-30-days policy + signs
 *   3. Agreement row written to membership_agreements (audit trail)
 *   4. Stripe Checkout (annual subscription) opens
 *   5. stripe-webhook links the signed agreement → activated user_memberships row
 */

interface Tier {
  key: 'none' | 'member' | 'vip' | 'concierge';
  name: string;
  planName: string;  // matches membership_plans.name
  annualPrice: number | null;  // dollars
  tagline: string;
  highlight?: string;
  ctaLabel: string;
  color: string;
  gradient: string;
  features: {
    label: string;
    value: string | boolean;
    highlight?: boolean;
  }[];
}

const TIERS: Tier[] = [
  {
    key: 'none',
    name: 'Pay-As-You-Go',
    planName: '',
    annualPrice: null,
    tagline: 'Book when slots open to the public',
    ctaLabel: 'Book a visit',
    color: 'border-gray-200',
    gradient: 'from-gray-50 to-white',
    features: [
      { label: 'Fasting booking window', value: 'Mon–Fri 6–9am only' },
      { label: 'Non-fasting booking window', value: 'Mon–Fri 9am–12pm only' },
      { label: 'Saturday access', value: false },
      { label: 'Advance booking window', value: '7 days' },
      { label: 'Same-day booking', value: false },
      { label: 'Family add-on (same visit)', value: '$75' },
      { label: 'Referral bonuses', value: false },
      { label: 'Results retrieval', value: '$25 / retrieval' },
      { label: 'Reschedule fee', value: '$25' },
      { label: 'Patient portal access', value: true },
    ],
  },
  {
    key: 'member',
    name: 'Regular',
    planName: 'Regular',
    annualPrice: 99,
    tagline: 'Morning lab access whenever you need it',
    ctaLabel: 'Become a Regular Member',
    color: 'border-emerald-200',
    gradient: 'from-emerald-50 to-white',
    features: [
      { label: 'Fasting booking window', value: 'Mon–Fri 6–9am', highlight: true },
      { label: 'Non-fasting booking window', value: 'Mon–Fri 6am–12pm', highlight: true },
      { label: 'Saturday access', value: '6–9am', highlight: true },
      { label: 'Advance booking window', value: '14 days' },
      { label: 'Same-day booking', value: false },
      { label: 'Family add-on (same visit)', value: '$60 (20% off)', highlight: true },
      { label: 'Referral bonuses', value: '$10 off per referral', highlight: true },
      { label: 'Results retrieval', value: 'Complimentary', highlight: true },
      { label: 'Reschedule fee', value: 'Waived', highlight: true },
      { label: 'Patient portal access', value: true },
      { label: 'Pause membership', value: '1 month / yr' },
    ],
  },
  {
    key: 'vip',
    name: 'VIP',
    planName: 'VIP',
    annualPrice: 199,
    tagline: 'Priority slots + family discounts',
    highlight: 'Most Popular',
    ctaLabel: 'Go VIP',
    color: 'border-[#B91C1C] ring-2 ring-[#B91C1C]/20',
    gradient: 'from-red-50 to-white',
    features: [
      { label: 'Fasting booking window', value: 'Mon–Fri 6–9am' },
      { label: 'Non-fasting booking window', value: 'Mon–Fri 6am–2pm', highlight: true },
      { label: 'Saturday access', value: '6am–11am', highlight: true },
      { label: 'Advance booking window', value: '30 days', highlight: true },
      { label: 'Same-day booking', value: false },
      { label: 'Family add-on (same visit)', value: '$45 (40% off)', highlight: true },
      { label: 'Referral bonuses', value: '$25 + friend gets 15% off', highlight: true },
      { label: 'Results retrieval', value: 'Complimentary' },
      { label: 'Reschedule fee', value: 'Waived' },
      { label: 'Patient portal access', value: true },
      { label: 'Pause membership', value: '2 months / yr' },
    ],
  },
  {
    key: 'concierge',
    name: 'Concierge',
    planName: 'Concierge',
    annualPrice: 399,
    tagline: 'Your own phleb, anytime, zero friction',
    highlight: 'Best Value',
    ctaLabel: 'Become Concierge',
    color: 'border-amber-400 ring-2 ring-amber-200',
    gradient: 'from-amber-50 to-white',
    features: [
      { label: 'Fasting booking window', value: 'Anytime (6am–8pm)', highlight: true },
      { label: 'Non-fasting booking window', value: 'Anytime (6am–8pm)', highlight: true },
      { label: 'Saturday access', value: 'Full hours + Sunday by request', highlight: true },
      { label: 'Advance booking window', value: '60 days', highlight: true },
      { label: 'Same-day booking', value: 'Guaranteed', highlight: true },
      { label: 'Family add-on (same visit)', value: 'FREE for 2 family members', highlight: true },
      { label: 'Referral bonuses', value: '$50 + friend gets 20% off (auto-applied)', highlight: true },
      { label: 'Results retrieval', value: 'Complimentary + phleb delivers to MD', highlight: true },
      { label: 'Reschedule fee', value: 'Waived' },
      { label: 'Patient portal access', value: true },
      { label: 'Dedicated phlebotomist', value: 'Same phleb every visit', highlight: true },
      { label: 'NDA / discretion', value: 'Available on request', highlight: true },
      { label: 'Travel — labs at any ConveLabs city', value: true, highlight: true },
      { label: 'Pause membership', value: '3 months / yr' },
    ],
  },
];

const FAQ = [
  { q: 'How is the annual fee billed?', a: 'One charge, once a year, to the card on file. You keep all benefits for 12 months. Renewal is automatic — you\'ll get an email reminder 30 days before.' },
  { q: 'What\'s your refund policy?', a: 'Full refund within the first 30 days — no questions. After 30 days the annual fee is non-refundable (we\'ve already reserved your priority slots for the year). You can pause up to 3 months/year to match your schedule.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Log in to your dashboard → My Recurring Plans → Cancel. Your benefits continue until the end of your billing year. We won\'t charge again.' },
  { q: 'What if a member benefit isn\'t delivered?', a: 'Concierge members get the "Concierge Promise" — if any visit isn\'t 5-star, your entire annual fee is refunded AND the next 3 visits are free. Regular and VIP members get same-day credit for any documented service failure.' },
  { q: 'Can I upgrade mid-year?', a: 'Yes — you pay the prorated difference. E.g. Regular → VIP upgrades at month 6 costs about $50. Downgrades take effect at next renewal.' },
  { q: 'Do non-members ever lose access?', a: 'No. Non-members can always book Mon–Fri mornings. Memberships just expand your window and remove fees — you\'re never locked out.' },
];

const Pricing: React.FC = () => {
  const { user } = useAuth();
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubscribe = async (tier: Tier, agreementMeta: { agreementVersion: string; agreementSha: string }) => {
    if (!user) {
      toast.info('Log in to subscribe.');
      window.location.href = `/login?redirect=${encodeURIComponent('/pricing')}`;
      return;
    }
    if (!tier.planName || !tier.annualPrice) {
      window.location.href = '/book-now';
      return;
    }

    setSubmitting(true);
    try {
      // 1. Write the signed agreement row BEFORE Stripe checkout (legal paper trail)
      const { data: agreement, error: agrErr } = await supabase
        .from('membership_agreements' as any)
        .insert({
          user_id: user.id,
          user_email: user.email,
          user_name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          plan_name: tier.planName,
          plan_annual_price_cents: tier.annualPrice * 100,
          billing_frequency: 'annual',
          agreement_version: agreementMeta.agreementVersion,
          agreement_text_sha256: agreementMeta.agreementSha,
          user_agent: navigator.userAgent,
          // ip_address captured server-side when Stripe webhook processes completion
        })
        .select()
        .single();
      if (agrErr) throw agrErr;

      // 2. Look up membership_plans.id to pass to create-checkout-session
      const { data: plan, error: planErr } = await supabase
        .from('membership_plans' as any)
        .select('id')
        .eq('name', tier.planName)
        .maybeSingle();
      if (planErr || !plan) throw planErr || new Error(`Plan ${tier.planName} not found`);

      // 3. Create Stripe subscription (annual)
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          planId: (plan as any).id,
          billingFrequency: 'annual',
          userId: user.id,
          metadata: {
            agreement_id: (agreement as any).id,
            agreement_version: agreementMeta.agreementVersion,
          },
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');
      window.location.href = data.url;
    } catch (err: any) {
      console.error('[pricing] subscribe failed:', err);
      toast.error(err.message || 'Failed to start checkout. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero */}
      <section className="py-16 md:py-20 bg-gradient-to-b from-gray-50 to-background">
        <div className="container mx-auto px-4 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-2 mb-5">
            <Sparkles className="h-4 w-4 text-amber-700" />
            <span className="text-sm font-semibold text-amber-800">
              Founding Member pricing — lock today's rates forever
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Pick the morning that fits your life.</h1>
          <p className="text-lg text-muted-foreground">
            Annual memberships unlock earlier mornings, Saturday access, lower family-add-on pricing,
            referral rewards, and more. Billed once a year — full refund for 30 days.
          </p>
        </div>
      </section>

      {/* 4-Tier Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto">
            {TIERS.map((tier) => (
              <Card key={tier.key} className={`border-2 ${tier.color} bg-gradient-to-b ${tier.gradient} relative flex flex-col`}>
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#B91C1C] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                    {tier.highlight}
                  </div>
                )}
                <CardContent className="p-5 flex flex-col flex-1">
                  {/* Icon + name */}
                  <div className="flex items-center gap-2 mb-1">
                    {tier.key === 'concierge' && <Crown className="h-5 w-5 text-amber-500" />}
                    {tier.key === 'vip' && <Star className="h-5 w-5 text-[#B91C1C]" />}
                    {tier.key === 'member' && <Sparkles className="h-5 w-5 text-emerald-600" />}
                    {tier.key === 'none' && <Heart className="h-5 w-5 text-gray-500" />}
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{tier.tagline}</p>

                  {/* Price */}
                  <div className="mb-4">
                    {tier.annualPrice ? (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-bold">${tier.annualPrice}</span>
                          <span className="text-xs text-muted-foreground">/year</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          That's ~${Math.round(tier.annualPrice / 12)}/mo · billed annually
                        </p>
                      </>
                    ) : (
                      <div className="text-3xl font-bold">Free</div>
                    )}
                  </div>

                  {/* Feature list */}
                  <div className="flex-1 space-y-2 mb-4">
                    {tier.features.map((f) => (
                      <div key={f.label} className="flex items-start gap-2 text-xs">
                        {typeof f.value === 'boolean' ? (
                          f.value ? (
                            <Check className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${f.highlight ? 'text-emerald-600' : 'text-gray-500'}`} />
                          ) : (
                            <X className="h-3.5 w-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
                          )
                        ) : (
                          <Check className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${f.highlight ? 'text-emerald-600' : 'text-gray-400'}`} />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className={`${f.highlight ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                            {typeof f.value === 'string' ? (
                              <>
                                <span className="text-gray-500">{f.label}: </span>
                                <span>{f.value}</span>
                              </>
                            ) : f.value ? (
                              f.label
                            ) : (
                              <span className="text-gray-400">{f.label}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <Button
                    className={`w-full ${
                      tier.key === 'concierge'
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : tier.key === 'vip'
                        ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
                        : tier.key === 'member'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-gray-800 hover:bg-gray-900 text-white'
                    }`}
                    onClick={() => {
                      if (tier.key === 'none') {
                        window.location.href = '/book-now';
                      } else {
                        setSelectedTier(tier);
                      }
                    }}
                    disabled={submitting}
                  >
                    {tier.ctaLabel}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Concierge Promise callout */}
          <div className="max-w-3xl mx-auto mt-12">
            <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-white">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Shield className="h-6 w-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-900 mb-1">The Concierge Promise</h3>
                  <p className="text-sm text-amber-900">
                    If <strong>any visit</strong> during your Concierge year isn't 5-star, we refund your
                    entire annual fee AND your next 3 visits are complimentary. No arbitration. No fine print.
                    This is what premium should mean.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 30-Day Refund + Terms anchor */}
      <section className="py-8 bg-gray-50 border-y">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="flex items-start gap-3 text-sm text-gray-700">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Refund policy — read before you subscribe:</p>
              <p>
                <strong>First 30 days:</strong> full refund, no questions.{' '}
                <strong>After 30 days:</strong> annual fees are non-refundable (we reserve your priority
                slots for the year). You can still <strong>pause</strong> your plan — up to 3 months/year
                depending on tier. Full terms shown when you subscribe.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-6">Common questions</h2>
          <Accordion type="single" collapsible>
            {FAQ.map((item, i) => (
              <AccordionItem key={i} value={`q${i}`}>
                <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                <AccordionContent>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <Footer />

      {/* Agreement dialog — must sign before Stripe checkout opens */}
      {selectedTier && (
        <MembershipAgreementDialog
          open={!!selectedTier}
          onClose={() => setSelectedTier(null)}
          tier={{
            name: selectedTier.name,
            planName: selectedTier.planName,
            annualPrice: selectedTier.annualPrice || 0,
          }}
          onAgreed={(meta) => handleSubscribe(selectedTier, meta)}
          submitting={submitting}
        />
      )}
    </div>
  );
};

export default Pricing;
