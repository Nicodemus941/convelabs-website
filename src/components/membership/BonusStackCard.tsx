import React from 'react';
import { Check, Lock, Users, Zap, Award, Sparkles } from 'lucide-react';

/**
 * BonusStackCard — the Hormozi $100M Offers "value ladder" display.
 *
 * Shows VIP at $199/yr as a stack of distinct bonuses, each with a
 * visible dollar value. Stacked value totals $474 for a $199 price —
 * the classic "pays for itself" anchor.
 *
 * Hormozi rule: each bonus has a name, an outcome, and a dollar value
 * tag. Don't just list features; itemize what each is WORTH.
 */

interface BonusRow {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  value: string;
  highlight?: boolean;
}

const VIP_BONUSES: BonusRow[] = [
  {
    icon: Sparkles,
    label: '12 months of VIP membership',
    description: 'Visits at $115 ($35 off standard rate)',
    value: '$199',
  },
  {
    icon: Lock,
    label: 'Founding rate-lock for life',
    description: 'Your $199/yr never raises — even when we do',
    value: '+$50/yr',
    highlight: true,
  },
  {
    icon: Users,
    label: 'Free family add-on',
    description: '1 extra household member at no extra cost',
    value: '+$75',
    highlight: true,
  },
  {
    icon: Zap,
    label: 'Priority same-day booking',
    description: 'Skip the +$100 STAT surcharge on urgent draws',
    value: '+$150',
  },
  {
    icon: Award,
    label: 'Founding Member badge + early access',
    description: 'Numbered badge on your profile · first access to new offerings',
    value: 'priceless',
  },
];

interface Props {
  className?: string;
  showCTA?: boolean;
  ctaText?: string;
  onCTAClick?: () => void;
}

const BonusStackCard: React.FC<Props> = ({ className = '', showCTA = false, ctaText = 'Claim my Founding seat →', onCTAClick }) => {
  return (
    <div className={`bg-gradient-to-br from-white to-rose-50 border-2 border-conve-red/30 rounded-2xl overflow-hidden shadow-sm ${className}`}>
      {/* Header */}
      <div className="bg-gradient-to-r from-conve-red to-red-900 text-white px-5 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200">Your $199 Founding VIP unlocks</p>
        <p className="text-lg font-bold">The full stack — one price</p>
      </div>

      {/* Stack */}
      <div className="p-5 space-y-3">
        {VIP_BONUSES.map((b, idx) => {
          const Icon = b.icon;
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
                b.highlight ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-100'
              }`}
            >
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                b.highlight ? 'bg-amber-100' : 'bg-white border border-gray-200'
              }`}>
                <Icon className={`h-4 w-4 ${b.highlight ? 'text-amber-700' : 'text-gray-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">{b.label}</p>
                  <span className={`text-xs font-bold whitespace-nowrap ${
                    b.highlight ? 'text-amber-700' : 'text-gray-500'
                  }`}>
                    {b.value}
                  </span>
                </div>
                <p className="text-[12px] text-gray-600 leading-snug mt-0.5">{b.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Value math */}
      <div className="bg-emerald-50 border-t border-emerald-200 px-5 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
            <Check className="h-4 w-4" /> Stacked value
          </div>
          <div className="text-right">
            <span className="line-through text-gray-400 text-xs mr-2">$474</span>
            <span className="text-emerald-700 font-bold text-lg">$199</span>
          </div>
        </div>
        <p className="text-[11px] text-emerald-700 mt-1">
          Pays for itself in 1 visit. Then the rest of the year is free.
        </p>
      </div>

      {/* CTA (optional) */}
      {showCTA && onCTAClick && (
        <div className="px-5 pb-5">
          <button
            onClick={onCTAClick}
            className="w-full bg-conve-red hover:bg-conve-red-dark text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {ctaText}
          </button>
        </div>
      )}
    </div>
  );
};

export default BonusStackCard;
