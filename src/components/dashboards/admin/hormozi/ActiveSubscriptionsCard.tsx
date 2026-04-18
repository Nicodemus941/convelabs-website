import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Repeat, Calendar, DollarSign, PauseCircle, Loader2, User, Mail, Phone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

/**
 * ACTIVE SUBSCRIPTIONS CARD — owner-level view of every recurring plan.
 *
 * Shows patients who are on a recurring subscription (Tier 3) OR an admin-
 * initiated prepaid bundle series. Computes MRR contribution from the
 * per-visit price × frequency_weeks so the owner sees the "quiet LTV" at
 * a glance.
 *
 * Appears in the Hormozi Dashboard's "Attention" section so the owner
 * can spot churn (cancellations), stale plans (no next_booking_date), and
 * who to upsell ("this patient is on monthly — pitch them quarterly").
 */

interface Plan {
  id: string;
  patient_email: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  service_type: string;
  service_name: string | null;
  frequency_weeks: number;
  next_booking_date: string | null;
  per_visit_price_cents: number | null;
  discount_percent: number | null;
  is_active: boolean;
  paused_until: string | null;
  cancelled_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

// Approximate MRR per plan: (52 / frequency_weeks) * per_visit_price / 12
function estimateMrrCents(p: Plan): number {
  if (!p.per_visit_price_cents || !p.frequency_weeks) return 0;
  const visitsPerYear = 52 / p.frequency_weeks;
  return Math.round((visitsPerYear * p.per_visit_price_cents) / 12);
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const dollarsDecimal = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const ActiveSubscriptionsCard: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('recurring_bookings' as any)
          .select('*')
          .is('cancelled_at', null)
          .eq('is_active', true)
          .order('next_booking_date', { ascending: true })
          .limit(25);
        setPlans((data as any) || []);
      } catch (e) {
        console.warn('[ActiveSubscriptionsCard] load failed', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalMrrCents = plans.reduce((sum, p) => sum + estimateMrrCents(p), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Repeat className="h-4 w-4 text-emerald-600" />
            Active Subscriptions
          </div>
          {!loading && plans.length > 0 && (
            <span className="text-xs font-normal text-emerald-700">
              Est. {dollars(totalMrrCents)}/mo MRR
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-sm text-gray-500 py-3">
            <p>No active subscriptions yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Patients who subscribe via the /visit page or prepay for a bundle show up here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y max-h-80 overflow-y-auto -mx-1 px-1">
            {plans.map((p) => {
              const mrrCents = estimateMrrCents(p);
              const isPaused = p.paused_until && new Date(p.paused_until) > new Date();
              return (
                <div key={p.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                        <User className="h-3 w-3 text-gray-400 flex-shrink-0" />
                        {p.patient_name || p.patient_email || '(unknown)'}
                        {isPaused && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">
                            <PauseCircle className="h-2.5 w-2.5" />
                            paused
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {p.service_name || p.service_type} · every {p.frequency_weeks}w
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-emerald-700">{mrrCents > 0 ? `${dollars(mrrCents)}/mo` : '—'}</p>
                      {p.per_visit_price_cents && (
                        <p className="text-[10px] text-gray-400">{dollarsDecimal(p.per_visit_price_cents)}/visit</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                    {p.next_booking_date && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Next: {format(new Date(p.next_booking_date + 'T12:00:00'), 'MMM d, yyyy')}
                      </span>
                    )}
                    {p.patient_email && (
                      <a href={`mailto:${p.patient_email}`} className="inline-flex items-center gap-1 text-gray-500 hover:text-[#B91C1C] truncate max-w-[160px]">
                        <Mail className="h-3 w-3" /> {p.patient_email}
                      </a>
                    )}
                    {p.patient_phone && (
                      <a href={`tel:${p.patient_phone}`} className="inline-flex items-center gap-1 text-gray-500 hover:text-[#B91C1C]">
                        <Phone className="h-3 w-3" /> {p.patient_phone}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveSubscriptionsCard;
