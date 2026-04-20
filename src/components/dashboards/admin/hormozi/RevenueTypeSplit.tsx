import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, PiggyBank, ShieldAlert } from 'lucide-react';

/**
 * I3 — Revenue-type splitter + Profit First bucketing.
 *
 * Membership revenue is NOT equivalent to visit revenue (different gross
 * margin, different cost profile, different deferred-discount liability).
 * This widget shows:
 *   - This month's revenue by type (visits vs memberships)
 *   - Profit First allocation per the differentiated splits (see Part I3)
 *   - YTD Discount Reserve balance — funds the member-discount liability
 *
 * Why it matters: the Profit First "bucket at the source" discipline only
 * works when you know which dollar goes into which bucket, and membership
 * dollars are 25% profit / 25% reserve, not 10% profit / 30% COGS like a
 * visit. Without this widget the founder is either under-bucketing profit
 * (leaving money on operating) or over-spending from a reserve that hasn't
 * accrued yet.
 */

interface RevenueSplit {
  visit_revenue_cents: number;
  membership_revenue_cents: number;
  visit_count: number;
  membership_count: number;
  profit_allocation_cents: number;
  owner_pay_allocation_cents: number;
  tax_allocation_cents: number;
  cogs_allocation_cents: number;
  discount_reserve_allocation_cents: number;
  opex_allocation_cents: number;
}

interface ReserveBalance {
  reserve_added_ytd_cents: number;
  discount_claimed_ytd_cents: number;
  reserve_balance_cents: number;
  breakage_to_date_cents: number;
}

const fmt = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const RevenueTypeSplit: React.FC = () => {
  const [split, setSplit] = useState<RevenueSplit | null>(null);
  const [reserve, setReserve] = useState<ReserveBalance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [mtd, rsv] = await Promise.all([
          supabase.rpc('get_revenue_by_type_mtd'),
          supabase.rpc('get_discount_reserve_ytd'),
        ]);
        if (mtd.data) setSplit(mtd.data as RevenueSplit);
        if (rsv.data) setReserve(rsv.data as ReserveBalance);
      } catch (e) {
        console.error('[RevenueTypeSplit] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading revenue split…
        </CardContent>
      </Card>
    );
  }

  if (!split) return null;

  const totalRevenue = split.visit_revenue_cents + split.membership_revenue_cents;
  const visitPct = totalRevenue > 0 ? (split.visit_revenue_cents / totalRevenue) * 100 : 0;
  const memberPct = totalRevenue > 0 ? (split.membership_revenue_cents / totalRevenue) * 100 : 0;

  const reserveUnderfunded = reserve && reserve.discount_claimed_ytd_cents > reserve.reserve_added_ytd_cents;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Revenue by type — this month
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Profit First allocations apply DIFFERENT splits to visit vs membership revenue.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue source split */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Visits</span>
            <span>
              {fmt(split.visit_revenue_cents)}
              <span className="text-muted-foreground text-xs ml-1">({split.visit_count})</span>
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Memberships</span>
            <span>
              {fmt(split.membership_revenue_cents)}
              <span className="text-muted-foreground text-xs ml-1">({split.membership_count})</span>
            </span>
          </div>
          {totalRevenue > 0 && (
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex">
              <div className="bg-blue-500" style={{ width: `${visitPct}%` }} />
              <div className="bg-emerald-500" style={{ width: `${memberPct}%` }} />
            </div>
          )}
          <div className="flex items-center justify-between text-sm pt-1 border-t">
            <span className="font-semibold">Total MTD</span>
            <span className="font-bold">{fmt(totalRevenue)}</span>
          </div>
        </div>

        {/* Profit First allocation */}
        <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <PiggyBank className="h-3.5 w-3.5" />
            Auto-bucket (Profit First)
          </div>
          <BucketRow label="Profit" cents={split.profit_allocation_cents} emphasis />
          <BucketRow label="Owner Pay" cents={split.owner_pay_allocation_cents} />
          <BucketRow label="Tax" cents={split.tax_allocation_cents} />
          <BucketRow label="COGS (visits only)" cents={split.cogs_allocation_cents} />
          <BucketRow label="Discount Reserve (memberships only)" cents={split.discount_reserve_allocation_cents} />
          <BucketRow label="OpEx" cents={split.opex_allocation_cents} />
        </div>

        {/* Discount Reserve YTD */}
        {reserve && (
          <div className={`rounded-lg p-3 space-y-1.5 border ${reserveUnderfunded ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50/60 border-emerald-200'}`}>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
              {reserveUnderfunded ? (
                <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-700" />
              )}
              <span className={reserveUnderfunded ? 'text-amber-800' : 'text-emerald-800'}>
                Discount Reserve · YTD
              </span>
            </div>
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div className="flex justify-between">
                <span>Added (25% of membership revenue)</span>
                <span className="font-mono">{fmt(reserve.reserve_added_ytd_cents)}</span>
              </div>
              <div className="flex justify-between">
                <span>Member discounts claimed</span>
                <span className="font-mono">{fmt(reserve.discount_claimed_ytd_cents)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-current/10 mt-1">
                <span className="font-semibold text-foreground">Balance</span>
                <span className="font-bold font-mono">
                  {fmt(reserve.reserve_balance_cents)}
                </span>
              </div>
            </div>
            {reserveUnderfunded ? (
              <p className="text-[11px] text-amber-800 pt-1">
                Members are claiming more discount than the 25% reserve covers. Either the discount tiers are too generous
                or membership growth is lagging visits. Watch for 2–3 months before re-balancing the split.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-800 pt-1">
                Breakage so far: {fmt(reserve.breakage_to_date_cents)}. This sweeps to Profit at year-end.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const BucketRow: React.FC<{ label: string; cents: number; emphasis?: boolean }> = ({ label, cents, emphasis }) => (
  <div className={`flex justify-between text-xs ${emphasis ? 'font-bold' : ''}`}>
    <span className={emphasis ? 'text-emerald-700' : 'text-muted-foreground'}>{label}</span>
    <span className={`font-mono ${emphasis ? 'text-emerald-700' : ''}`}>
      ${(cents / 100).toFixed(2)}
    </span>
  </div>
);

export default RevenueTypeSplit;
