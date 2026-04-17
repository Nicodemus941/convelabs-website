import React from 'react';
import { Star, Shield } from 'lucide-react';

/**
 * BOOKING TRUST STRIPE — Credibility Anchor for Direct Landings
 *
 * Hormozi principle: whenever someone lands cold (ad click, email link,
 * referral URL) on a booking page without seeing the full homepage
 * narrative, they need INSTANT credibility before they'll commit to
 * entering details + paying.
 *
 * This is a condensed version of the homepage trust stripe — same
 * signals (NFL, Morelli, 164 reviews, HIPAA) but laid out horizontally
 * and compact to sit above the BookingFlow without stealing focus.
 *
 * Sits between the page title and the first step of the booking form.
 */

const BookingTrustStripe: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto mb-6 md:mb-8">
      {/* NFL quote — the category killer */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white rounded-xl p-4 md:p-5 mb-4 shadow-lg">
        <div className="flex items-start gap-3">
          <span className="text-2xl md:text-3xl flex-shrink-0">🏈</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm md:text-base font-semibold leading-snug">
              "Better than what I got in the NFL."
            </p>
            <p className="text-xs text-gray-300 mt-1">
              — Deiontrez Mount, NFL Linebacker (Titans · Colts · Broncos)
            </p>
          </div>
        </div>
      </div>

      {/* Credibility row */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 md:gap-x-6 gap-y-2 text-xs md:text-sm text-gray-600 pb-4 border-b border-gray-200">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map(i => (
              <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <span className="font-semibold text-gray-900">5.0</span>
          <span>(164 reviews)</span>
        </div>

        <span className="text-gray-300">·</span>

        <div className="flex items-center gap-1.5">
          <span>💪</span>
          <span>
            Endorsed by <span className="font-semibold text-gray-900">@morellifit</span>
            <span className="text-gray-500 ml-1">(1M+)</span>
          </span>
        </div>

        <span className="text-gray-300">·</span>

        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-conve-red" />
          <span>HIPAA Compliant</span>
        </div>

        <span className="text-gray-300 hidden md:inline">·</span>

        <div className="flex items-center gap-1.5">
          <span>🛡️</span>
          <span className="font-medium text-gray-900">On-time or your visit is FREE</span>
        </div>
      </div>
    </div>
  );
};

export default BookingTrustStripe;
