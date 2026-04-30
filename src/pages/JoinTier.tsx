/**
 * /join?tier=vip&email=foo@bar.com — direct-to-checkout membership signup.
 *
 * Why this exists: post-visit-sequences (and patient blast emails) point
 * to `/join?tier=vip` to give patients a 1-click upgrade. There was no
 * matching route, so every click 404'd silently and patients couldn't
 * register. (17 patients hit the dead link in the last 30 days.)
 *
 * This page:
 *   1. Reads tier + email from query params
 *   2. Maps tier name → membership_plans row
 *   3. Calls the existing create-checkout-session edge fn with that planId
 *   4. Redirects to Stripe Checkout
 *
 * No new edge function. No new schema. Reuses what already works for the
 * /pricing flow — just fixes the entrypoint.
 */

import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { createCheckoutSession } from '@/services/stripe';
import { Loader2, AlertCircle } from 'lucide-react';

// Map of friendly tier names → membership_plans.name. Keep in sync with the
// names in membership_plans (Individual / Individual +1 / Family Plan / etc.).
const TIER_TO_PLAN_NAME: Record<string, string[]> = {
  vip:          ['VIP', 'Individual'],          // VIP first; Individual is the active fallback
  member:       ['Individual'],
  'individual': ['Individual'],
  'individual+1': ['Individual +1'],
  family:       ['Family Plan'],
  concierge:    ['Concierge'],
  essential:    ['Essential Care'],
};

const JoinTier: React.FC = () => {
  const [params] = useSearchParams();
  const tier = (params.get('tier') || '').toLowerCase().trim();
  const email = params.get('email') || '';
  const billing = (params.get('billing') || 'annual') as 'annual' | 'monthly' | 'quarterly';

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Loading your plan…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tier) {
        setError('Missing tier — try the link from your email again.');
        return;
      }
      const candidateNames = TIER_TO_PLAN_NAME[tier];
      if (!candidateNames || candidateNames.length === 0) {
        setError(`We don't recognize tier "${tier}". Try /pricing to pick a plan.`);
        return;
      }

      try {
        setStatus('Finding your plan…');
        const { data: plans, error: planErr } = await supabase
          .from('membership_plans')
          .select('id, name, monthly_price, quarterly_price, annual_price')
          .in('name', candidateNames);
        if (planErr || !plans || plans.length === 0) {
          throw new Error(planErr?.message || 'No matching plan');
        }

        // Pick the plan in candidate-name priority order
        const plan = candidateNames
          .map((n) => plans.find((p: any) => p.name === n))
          .find(Boolean);
        if (!plan) throw new Error('No matching plan');

        if (cancelled) return;
        setStatus(`Opening secure checkout for ${plan.name}…`);

        const result = await createCheckoutSession(
          plan.id,
          billing,
          undefined,
          false,
          {
            source: 'join_tier_link',
            tier,
            ...(email ? { prefill_email: email } : {}),
          },
          false,
          null,
        );

        if (cancelled) return;
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.url) {
          window.location.href = result.url;
          return;
        }
        setError('Could not open checkout. Please try again.');
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Something went wrong.');
      }
    })();
    return () => { cancelled = true; };
  }, [tier, email, billing]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow border p-8 text-center">
        <h1 className="text-2xl font-bold text-[#B91C1C] mb-1">ConveLabs</h1>
        <p className="text-xs text-gray-500 mb-6">Concierge Lab Services</p>
        {error ? (
          <div className="space-y-4">
            <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
            <p className="text-sm text-gray-800">{error}</p>
            <p className="text-xs text-gray-500">
              You can pick a plan directly from{' '}
              <Link to="/pricing" className="text-[#B91C1C] font-medium underline">our pricing page</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-[#B91C1C] mx-auto" />
            <p className="text-sm text-gray-700">{status}</p>
            <p className="text-[11px] text-gray-400">Don't refresh — we'll redirect you to secure checkout.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinTier;
