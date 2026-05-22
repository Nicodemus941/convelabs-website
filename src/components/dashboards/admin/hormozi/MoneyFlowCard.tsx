import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DollarSign, AlertTriangle, TrendingDown, Banknote, FileWarning, Users } from 'lucide-react';

/**
 * MoneyFlowCard — the CFO-layer tile.
 *
 * Single question this tile answers: "Where is the money this month?"
 *
 * Reads get_money_flow(30) which buckets every appointment into:
 *   01_collected_stripe_net    — the good bucket (paid + business kept its cut)
 *   02_prepaid_via_lab_request — prepaid before booking
 *   03_check_or_cash           — paid out-of-band (no Stripe net to track)
 *   04_owed_unpaid_org         — partner-billed, not yet invoiced/paid
 *   05_owed_unpaid_patient     — patient owes (dunning territory)
 *   07_fee_waived              — comp'd visits where phleb was paid anyway (LEAK)
 *   08_companion_dedup         — bundle bookings where business kept only one floor (LEAK)
 *
 * Buckets 07 & 08 are the historical leaks v4 closed. They display the
 * pre-v4 damage so the owner can see what the rule change recovered.
 *
 * Tap a bucket → expands to show the contributing appointments via the
 * companion list_phantom_paid_appointments RPC (future iteration).
 */

interface Bucket {
  bucket: string;
  appointment_count: number;
  gross_dollars: string;
  stripe_net_dollars: string;
  phleb_paid_dollars: string;
  business_kept_dollars: string;
}

const BUCKET_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: 'good' | 'neutral' | 'warning' | 'leak'; blurb: string }> = {
  '01_collected_stripe_net':    { label: 'Collected via Stripe', icon: Banknote, tone: 'good', blurb: 'Patient paid · Stripe netted · business kept its cut' },
  '02_prepaid_via_lab_request': { label: 'Prepaid via lab request', icon: DollarSign, tone: 'neutral', blurb: 'Patient paid prior to booking — counted at lab-request settle' },
  '03_check_or_cash':           { label: 'Check or cash', icon: DollarSign, tone: 'neutral', blurb: 'Paid out-of-band — phleb gets cut, no Stripe trail' },
  '04_owed_unpaid_org':         { label: 'Owed (org unpaid)', icon: FileWarning, tone: 'warning', blurb: 'Partner-billed, invoice not yet paid by the org' },
  '05_owed_unpaid_patient':     { label: 'Owed (patient unpaid)', icon: FileWarning, tone: 'warning', blurb: 'Patient outstanding — dunning cascade should be firing' },
  '07_fee_waived':              { label: 'Fee-waived (historical leak)', icon: TrendingDown, tone: 'leak', blurb: 'Comp’d $0 visits where phleb was still paid. v4 rule (5/21) stops this going forward.' },
  '08_companion_dedup':         { label: 'Companion bundles (historical leak)', icon: Users, tone: 'leak', blurb: 'Pre-v4 bundles where business kept only ONE $87 floor for multi-body visits. Per-body floor closed this 5/21.' },
};

const toneClasses = {
  good:    { bg: 'bg-emerald-50', border: 'border-emerald-200', accent: 'text-emerald-700' },
  neutral: { bg: 'bg-gray-50',    border: 'border-gray-200',    accent: 'text-gray-700' },
  warning: { bg: 'bg-amber-50',   border: 'border-amber-200',   accent: 'text-amber-700' },
  leak:    { bg: 'bg-rose-50',    border: 'border-rose-200',    accent: 'text-rose-700' },
};

const fmt = (s: string): string => {
  const n = parseFloat(s || '0');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
const fmtPrecise = (s: string): string => {
  const n = parseFloat(s || '0');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const MoneyFlowCard: React.FC<{ days?: number }> = ({ days = 30 }) => {
  const [rows, setRows] = useState<Bucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.rpc('get_money_flow' as any, { p_days: days });
      if (cancelled) return;
      setRows((data as any[] | null) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [days]);

  const grossTotal = rows.reduce((s, r) => s + parseFloat(r.gross_dollars || '0'), 0);
  const businessTotal = rows.reduce((s, r) => s + parseFloat(r.business_kept_dollars || '0'), 0);
  const phlebTotal = rows.reduce((s, r) => s + parseFloat(r.phleb_paid_dollars || '0'), 0);
  const leakTotal = rows
    .filter(r => BUCKET_META[r.bucket]?.tone === 'leak')
    .reduce((s, r) => s + parseFloat(r.business_kept_dollars || '0'), 0);
  const apptTotal = rows.reduce((s, r) => s + (r.appointment_count || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-emerald-700" />
          Money Flow · last {days}d
          {leakTotal < -1 && (
            <Badge variant="outline" className="ml-auto bg-rose-50 text-rose-700 border-rose-200 text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Leak: {fmtPrecise(String(Math.abs(leakTotal)))}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-xs text-muted-foreground py-6 text-center">Loading...</div>
        ) : (
          <>
            {/* Top-line summary */}
            <div className="grid grid-cols-3 gap-3 mb-4 pb-4 border-b">
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Gross</div>
                <div className="text-lg font-semibold text-gray-900">{fmt(String(grossTotal))}</div>
                <div className="text-[11px] text-muted-foreground">{apptTotal} visits</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Phleb paid</div>
                <div className="text-lg font-semibold text-gray-900">{fmt(String(phlebTotal))}</div>
                <div className="text-[11px] text-muted-foreground">{grossTotal > 0 ? `${((phlebTotal/grossTotal)*100).toFixed(0)}% of gross` : '—'}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Business kept</div>
                <div className={`text-lg font-semibold ${businessTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmt(String(businessTotal))}</div>
                <div className="text-[11px] text-muted-foreground">{grossTotal > 0 ? `${((businessTotal/grossTotal)*100).toFixed(0)}% margin` : '—'}</div>
              </div>
            </div>

            {/* Per-bucket grid */}
            <div className="space-y-2">
              {rows.map(r => {
                const meta = BUCKET_META[r.bucket] || { label: r.bucket, icon: DollarSign, tone: 'neutral' as const, blurb: '' };
                const t = toneClasses[meta.tone];
                const Icon = meta.icon;
                const business = parseFloat(r.business_kept_dollars || '0');
                return (
                  <div key={r.bucket} className={`flex items-start gap-3 p-2.5 rounded-md ${t.bg} border ${t.border}`}>
                    <Icon className={`h-4 w-4 mt-0.5 ${t.accent} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-xs font-semibold text-gray-900">{meta.label}</div>
                        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {r.appointment_count} visit{r.appointment_count === 1 ? '' : 's'} · gross {fmt(r.gross_dollars)}
                        </div>
                      </div>
                      <div className="flex items-baseline justify-between gap-3 mt-0.5">
                        <div className="text-[11px] text-muted-foreground leading-tight">{meta.blurb}</div>
                        <div className={`text-xs font-semibold tabular-nums shrink-0 ${business >= 0 ? 'text-gray-900' : 'text-rose-700'}`}>
                          {business >= 0 ? '+' : ''}{fmtPrecise(r.business_kept_dollars)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {rows.length === 0 && (
                <div className="text-xs text-muted-foreground py-4 text-center">No money flow in this window.</div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground">
              Source of truth: <code className="text-[10px]">get_money_flow({days})</code>. Each row = appointment + payment outcome reconciled to Stripe.
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MoneyFlowCard;
