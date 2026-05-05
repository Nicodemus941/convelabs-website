/**
 * Named Bundle Cards (Hormozi v1)
 *
 * Renders the 4 anchor stacked-service bundles as conversion cards on
 * the public Services page. Each card shows:
 *   - Bundle name + tagline (Hormozi naming = identity)
 *   - Services included
 *   - Anchor price (struck through)
 *   - Stacked price (red, bold)
 *   - Dollar savings ("save $50")
 *   - CTA button → /book-now with the bundle prefilled
 *
 * The savings number is computed live by calculateStackedTotal so any
 * change to the curve or to per-service pricing flows through with no
 * extra wiring.
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { calculateStackedTotal } from '@/services/pricing/multiServicePricing';

interface NamedBundle {
  name: string;
  tagline: string;
  services: string[];                  // service IDs
  serviceLabels: string[];             // human-readable labels
  badge?: string;                      // e.g. "Most Popular"
  badgeVariant?: 'default' | 'gold';
  anchorService?: string;              // service to prefill in booking
}

const BUNDLES: NamedBundle[] = [
  {
    name: 'The Wellness Stack',
    tagline: 'Mobile draw + a specialty kit. The starter Stack.',
    services: ['mobile', 'specialty-kit'],
    serviceLabels: ['Mobile Blood Draw', 'Specialty Collection Kit'],
    anchorService: 'mobile',
  },
  {
    name: 'The Therapeutic Pair',
    tagline: 'Therapeutic phlebotomy + your annual mobile draw — one trip.',
    services: ['therapeutic', 'mobile'],
    serviceLabels: ['Therapeutic Phlebotomy', 'Mobile Blood Draw'],
    anchorService: 'therapeutic',
  },
  {
    name: 'The Reset Stack',
    tagline: 'Therapeutic reset + a specialty kit for the deep dive.',
    services: ['therapeutic', 'specialty-kit'],
    serviceLabels: ['Therapeutic Phlebotomy', 'Specialty Collection Kit'],
    anchorService: 'therapeutic',
  },
  {
    name: 'The Full Workup',
    tagline: 'Everything. The annual longevity protocol.',
    services: ['therapeutic', 'mobile', 'specialty-kit'],
    serviceLabels: ['Therapeutic Phlebotomy', 'Mobile Blood Draw', 'Specialty Collection Kit'],
    badge: 'Most Popular',
    badgeVariant: 'gold',
    anchorService: 'therapeutic',
  },
];

const NamedBundleCards: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="my-16">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-50 border border-red-100 text-red-700 text-sm font-semibold mb-4">
          <Sparkles className="w-4 h-4" />
          Stack & Save — One Visit, Multiple Services
        </div>
        <h2 className="text-3xl font-bold mb-3">Bundle Two Services. Pay for One Visit.</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          We do the work in one trip — you save up to 40% on every additional service.
          Add a companion at any tier. Family savings applied automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {BUNDLES.map((bundle) => {
          const stack = calculateStackedTotal(bundle.services, 'none');
          const isMostPopular = bundle.badge === 'Most Popular';

          return (
            <Card
              key={bundle.name}
              className={`relative overflow-hidden transition-all hover:shadow-xl ${
                isMostPopular
                  ? 'border-2 border-red-600 shadow-lg scale-[1.02]'
                  : 'border border-gray-200 hover:border-red-300'
              }`}
            >
              {bundle.badge && (
                <div
                  className={`absolute top-0 right-0 px-3 py-1 text-xs font-bold text-white ${
                    bundle.badgeVariant === 'gold'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600'
                      : 'bg-red-600'
                  } rounded-bl-lg`}
                >
                  {bundle.badge}
                </div>
              )}

              <CardContent className="p-6 flex flex-col h-full">
                <h3 className="text-xl font-bold mb-1">{bundle.name}</h3>
                <p className="text-sm text-muted-foreground mb-5 min-h-[40px]">{bundle.tagline}</p>

                <ul className="space-y-2 mb-5 flex-1">
                  {bundle.serviceLabels.map((label, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t pt-4 mt-auto">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-sm text-muted-foreground line-through">
                      ${stack.unbundledTotal.toFixed(0)}
                    </span>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 font-semibold">
                      Save ${stack.totalSavings.toFixed(0)}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-3xl font-bold text-red-700">
                      ${stack.subtotal.toFixed(0)}
                    </span>
                    <span className="text-sm text-muted-foreground">all in</span>
                  </div>

                  <Button
                    className={`w-full ${
                      isMostPopular
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-gray-900 hover:bg-gray-800 text-white'
                    }`}
                    onClick={() => {
                      // Prefill the booking flow with this bundle's anchor
                      // service. Additional services follow in a follow-up
                      // PR (multi-service picker UI inside BookingFlow).
                      const anchor = bundle.anchorService || bundle.services[0];
                      navigate(`/book-now?service=${anchor}&bundle=${encodeURIComponent(bundle.name)}`);
                    }}
                  >
                    Book This Stack
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Stacking discount: 1st service full price · 2nd save 25% · 3rd save 35% · 4th+ save 40%.
        Member, VIP, and Concierge tiers stack on top — your tier price applies first.
      </p>
    </section>
  );
};

export default NamedBundleCards;
