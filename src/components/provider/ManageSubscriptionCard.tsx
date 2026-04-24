import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Crown, ExternalLink, Loader2, Users, CreditCard, Check } from 'lucide-react';
import { format } from 'date-fns';

/**
 * ManageSubscriptionCard — shown on provider dashboard when org has an
 * active subscription. Mirror of SubscribeYourPracticeCard but for the
 * "already subscribed" state: shows current plan + seats used/available
 * + opens Stripe Customer Portal for all self-serve subscription actions.
 */

interface Status {
  status: string | null;
  tier: string | null;
  seat_cap: number | null;
  per_seat_cents: number | null;
  price_cents: number | null;
  started_at: string | null;
  stripe_customer_id: string | null;
  active_seats: number;
  seats_remaining: number;
}

interface Props {
  orgId: string;
  orgName: string;
}

const ManageSubscriptionCard: React.FC<Props> = ({ orgId, orgName }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_org_subscription_status' as any, { p_org_id: orgId });
      if (error) throw error;
      setStatus(data as Status);
    } catch (e: any) {
      console.warn('[manage-sub] status load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const openPortal = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-stripe-portal-session');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any)?.message || (data as any)?.error);
      const url = (data as any)?.url;
      if (!url) throw new Error('No portal URL returned');
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Could not open subscription portal');
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm animate-pulse">
        <CardContent className="p-5">
          <div className="h-5 w-40 bg-gray-200 rounded mb-3" />
          <div className="h-10 w-full bg-gray-100 rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!status || status.status !== 'active') return null;

  const monthly = (status.price_cents || 0) / 100;
  const perSeat = (status.per_seat_cents || 8500) / 100;
  const seatUsage = status.seat_cap ? (status.active_seats / status.seat_cap) : 0;
  const nearFull = seatUsage >= 0.8;
  const full = seatUsage >= 1;

  return (
    <Card className="shadow-sm border-emerald-200 bg-gradient-to-br from-emerald-50/30 via-white to-white">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Crown className="h-5 w-5 text-emerald-600" />
          <CardTitle className="text-base">Practice subscription</CardTitle>
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
            ✓ Active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan summary — 2-col on narrow mobile, 3-col once there's room */}
        <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
          <div className="bg-white border rounded-lg p-2.5 sm:p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Monthly</p>
            <p className="text-base sm:text-lg font-bold text-gray-900 mt-0.5">${monthly.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500">${perSeat}/patient</p>
          </div>
          <div className="bg-white border rounded-lg p-2.5 sm:p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Seats used</p>
            <p className={`text-base sm:text-lg font-bold mt-0.5 ${full ? 'text-red-600' : nearFull ? 'text-amber-600' : 'text-emerald-600'}`}>
              {status.active_seats}/{status.seat_cap || 0}
            </p>
            <p className="text-[10px] text-gray-500">{status.seats_remaining} left</p>
          </div>
          <div className="bg-white border rounded-lg p-2.5 sm:p-3 text-center col-span-2 xs:col-span-1">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Member since</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">
              {status.started_at ? format(new Date(status.started_at), 'MMM yyyy') : '—'}
            </p>
          </div>
        </div>

        {/* Seat-utilization bar */}
        {status.seat_cap && (
          <div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full transition-all ${full ? 'bg-red-500' : nearFull ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(100, seatUsage * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              {full
                ? '⚠ Seats full — upgrade to enroll more patients'
                : nearFull
                ? `Nearing capacity — ${status.seats_remaining} seats left`
                : `${Math.round(seatUsage * 100)}% of your seats are in use`}
            </p>
          </div>
        )}

        {/* Manage CTA */}
        <Button
          onClick={openPortal}
          disabled={opening}
          variant="outline"
          className="w-full gap-1.5"
        >
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Manage plan, card, or invoices
          <ExternalLink className="h-3 w-3 ml-0.5" />
        </Button>
        <p className="text-[11px] text-center text-gray-500">
          Opens Stripe's secure self-serve portal — change seats, update card, or cancel.
        </p>
      </CardContent>
    </Card>
  );
};

export default ManageSubscriptionCard;
