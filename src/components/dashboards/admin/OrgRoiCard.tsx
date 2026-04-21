import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { TrendingUp, DollarSign, Calendar } from 'lucide-react';

/**
 * OrgRoiCard — per-partner lifetime ROI from get_org_roi() RPC.
 *
 * Hormozi: every partner conversation is a negotiation. Showing
 * "23 visits, $3,250 generated, last referral 4d ago" gives the admin
 * concrete numbers to back a rate ask or renewal. Without this, every
 * pitch is vibes-based.
 */
interface Props { orgId: string }
interface RoiData {
  visit_count: number;
  completed_visits: number;
  total_revenue_cents: number;
  outstanding_cents: number;
  avg_visit_cents: number;
  first_visit_date: string | null;
  last_visit_date: string | null;
}

const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(0)}`;

const OrgRoiCard: React.FC<Props> = ({ orgId }) => {
  const [data, setData] = useState<RoiData | null>(null);

  useEffect(() => {
    if (!orgId) return;
    supabase.rpc('get_org_roi' as any, { p_org_id: orgId }).then(({ data }) => {
      if (data) setData(data as RoiData);
    });
  }, [orgId]);

  if (!data || data.visit_count === 0) return null;

  const monthsSinceFirst = data.first_visit_date
    ? Math.max(1, Math.round((Date.now() - new Date(data.first_visit_date).getTime()) / (1000 * 3600 * 24 * 30)))
    : 1;
  const monthlyRunRate = data.total_revenue_cents / monthsSinceFirst;

  return (
    <Card className="shadow-sm border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-emerald-700" />
          <p className="font-semibold text-sm">Partnership ROI</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Total revenue</p>
            <p className="text-lg font-bold text-emerald-700">{dollars(data.total_revenue_cents)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Visits</p>
            <p className="text-lg font-bold">{data.completed_visits || 0} <span className="text-xs font-normal text-gray-500">/ {data.visit_count}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Avg per visit</p>
            <p className="text-lg font-bold">{dollars(data.avg_visit_cents)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wide">Monthly run rate</p>
            <p className="text-lg font-bold text-gray-900">{dollars(monthlyRunRate)}</p>
          </div>
        </div>
        <div className="flex justify-between text-[11px] text-gray-500 mt-3 pt-2 border-t">
          <span><Calendar className="h-3 w-3 inline mr-1" />First visit {data.first_visit_date ? new Date(data.first_visit_date).toLocaleDateString() : '—'}</span>
          <span>Last {data.last_visit_date ? new Date(data.last_visit_date).toLocaleDateString() : '—'}</span>
          {data.outstanding_cents > 0 && (
            <span className="text-amber-700">Outstanding AR {dollars(data.outstanding_cents)}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default OrgRoiCard;
