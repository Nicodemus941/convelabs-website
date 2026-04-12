
import React from "react";
import { Check, ArrowRight, Calendar, Percent, Crown, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withSource, ENROLLMENT_URL } from '@/lib/constants/urls';

const TIERS = [
  {
    name: 'Essential',
    price: 29,
    period: '/month',
    annual: '$299/year (save 15%)',
    discount: '15% off',
    badge: null,
    color: 'border-blue-200 bg-blue-50/30',
    features: [
      '15% off all services',
      'Weekend appointments (Sat 6 AM - 9:30 AM)',
      'Priority scheduling',
      'Digital receipts & history',
    ],
  },
  {
    name: 'Premium',
    price: 59,
    period: '/month',
    annual: '$599/year (save 15%)',
    discount: '20% off',
    badge: 'Most Popular',
    color: 'border-conve-red/30 bg-red-50/30 ring-2 ring-conve-red/10',
    features: [
      '20% off all services',
      'Weekend appointments (Sat 6 AM - 9:30 AM)',
      'Priority same-day scheduling',
      'Family member add-ons at $45 each',
      'Extended hours availability',
      'Digital receipts & history',
    ],
  },
  {
    name: 'Concierge',
    price: 149,
    period: '/month',
    annual: '$1,499/year (save 16%)',
    discount: '25% off',
    badge: 'Best Value',
    color: 'border-amber-200 bg-amber-50/30',
    features: [
      '25% off all services',
      'Weekend & extended hours',
      'Dedicated phlebotomist',
      'Same-day guaranteed',
      'NDA available for VIP clients',
      'Family member add-ons at $45 each',
      'Concierge phone support',
    ],
  },
];

const MembershipSection = () => {
  const handleRedirectToMembership = () => {
    window.location.href = withSource(ENROLLMENT_URL, 'membership_section');
  };

  return (
    <section id="membership" className="py-20 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 rounded-full border border-green-200 mb-4">
            <Percent className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold text-green-800">Save up to 25% on every visit</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Membership Plans</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Members save on every service and unlock weekend appointments. No credits, no confusion — just a straight discount on whatever you book.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TIERS.map((tier) => (
            <div key={tier.name} className={`relative border-2 rounded-2xl p-6 bg-white ${tier.color}`}>
              {tier.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-conve-red text-white text-xs font-semibold px-3 py-1 rounded-full">
                  {tier.badge}
                </div>
              )}

              <h3 className="text-xl font-bold">{tier.name}</h3>

              <div className="mt-3">
                <span className="text-4xl font-bold">${tier.price}</span>
                <span className="text-muted-foreground">{tier.period}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{tier.annual}</p>

              <div className="mt-2 inline-flex items-center gap-1 bg-green-100 text-green-800 text-sm font-semibold px-2.5 py-1 rounded-full">
                <Percent className="h-3.5 w-3.5" />
                {tier.discount} all services
              </div>

              <div className="mt-5 space-y-3">
                {tier.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <Check className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleRedirectToMembership}
                className={`w-full mt-6 rounded-xl ${
                  tier.badge ? 'bg-conve-red hover:bg-conve-red-dark text-white' : ''
                }`}
                variant={tier.badge ? 'default' : 'outline'}
              >
                Get Started <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Non-member comparison */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-3 bg-white border rounded-xl px-6 py-3 text-sm">
            <span className="text-muted-foreground">Non-member mobile visit:</span>
            <span className="line-through text-muted-foreground">$150</span>
            <span className="font-bold text-green-600">Essential: $127.50</span>
            <span className="font-bold text-green-600">Premium: $120</span>
            <span className="font-bold text-green-600">Concierge: $112.50</span>
          </div>
        </div>

        {/* Practice Partner CTA */}
        <div className="mt-8 text-center">
          <p className="text-muted-foreground text-sm">
            Are you a medical practice?{' '}
            <a href="/b2b" className="text-conve-red font-semibold hover:underline">
              Learn about Practice Partner pricing →
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default MembershipSection;
