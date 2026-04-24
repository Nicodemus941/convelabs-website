import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Crown, Users, DollarSign } from 'lucide-react';

/**
 * OrgSubscriptionStatusCard — admin visibility on the org detail Overview.
 * Shows whether the org is on an active subscription, which plan, and
 * seat usage. Read-only — admin can nudge the provider to subscribe
 * but doesn't mutate their subscription directly.
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
}

const OrgSubscriptionStatusCard: React.FC<Props> = ({ orgId }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc('get_org_subscription_status' as any, { p_org_id: orgId });
      setStatus(data as Status);
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Card className="shadow-sm animate-pulse"><CardContent className="p-4"><div className="h-5 w-40 bg-gray-200 rounded mb-2" /><div className="h-8 bg-gray-100 rounded" /></CardContent></Card>;
  if (!status) return null;

  const isActive = status.status === 'active';
  const monthly = (status.price_cents || 0) / 100;
  const perSeat = (status.per_seat_cents || 8500) / 100;

  if (!isActive) {
    return (
      <Card className="shadow-sm border-dashed border-gray-300 bg-gray-50">
        <CardContent className="p-4 flex items-center gap-3">
          <Crown className="h-5 w-5 text-gray-400" />
          <div className="flex-1">
            <p className="font-semibold text-sm text-gray-700">No practice subscription</p>
            <p className="text-xs text-gray-500 mt-0.5">
              This org hasn't subscribed. They can sign up at $85/patient from their provider dashboard.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] bg-gray-100">
            {status.status || 'Not subscribed'}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  const usage = status.seat_cap ? status.active_seats / status.seat_cap : 0;

  return (
    <Card className="shadow-sm border-emerald-200 bg-gradient-to-br from-emerald-50/30 via-white to-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Crown className="h-5 w-5 text-emerald-600" />
          <p className="font-semibold text-sm text-gray-900">Practice subscription</p>
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">✓ Active</Badge>
          {status.started_at && (
            <span className="text-[10px] text-gray-500 ml-auto">
              Since {format(new Date(status.started_at), 'MMM d, yyyy')}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white border rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              <DollarSign className="h-3 w-3" /> Monthly
            </div>
            <p className="text-base font-bold text-gray-900 mt-0.5">${monthly.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500">${perSeat}/patient</p>
          </div>
          <div className="bg-white border rounded-lg p-2.5 text-center">
            <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              <Users className="h-3 w-3" /> Seats
            </div>
            <p className="text-base font-bold text-gray-900 mt-0.5">{status.active_seats}/{status.seat_cap || 0}</p>
            <p className="text-[10px] text-gray-500">{status.seats_remaining} left</p>
          </div>
          <div className="bg-white border rounded-lg p-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Utilization</p>
            <p className="text-base font-bold text-gray-900 mt-0.5">{Math.round(usage * 100)}%</p>
            <p className="text-[10px] text-gray-500">of seats in use</p>
          </div>
        </div>

        {status.seat_cap && (
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full transition-all ${usage >= 1 ? 'bg-red-500' : usage >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, usage * 100)}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrgSubscriptionStatusCard;
