import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useHormoziData } from '@/hooks/useHormoziData';

/**
 * OpsHealthCard — the single 0-100 "is the business healthy?" pulse.
 *
 * Part I2 Phase 1 deliverable. The number a franchisee (or an owner
 * glancing on mobile) sees in 2 seconds and knows whether to relax or
 * dig in. Composite of 5 pillars, each weighted equally (20%):
 *
 *   1. SOP coverage        — published training_courses vs target 20
 *   2. Data health         — unclassified / errors / stuck sequences
 *   3. Payments health     — unpaid invoices + stale age
 *   4. Retention           — 90d repeat rate vs 30% Level-0 gate
 *   5. Activity            — visits MTD vs 30 Level-0 gate
 *
 * Green ≥ 85, Amber 65-84, Red < 65. The breakdown below the big
 * number tells you exactly which pillar to work on next.
 */

const SOP_COVERAGE_TARGET = 20; // published SOP courses
const DATA_HEALTH_MAX_ISSUES = 10; // >10 unclassified/stuck/errors = 0 score
const UNPAID_INVOICES_MAX = 5; // >5 unpaid = 0 score
const VISITS_MTD_TARGET = 30;
const REPEAT_RATE_TARGET = 30;

interface Pillar {
  key: string;
  label: string;
  score: number;
  detail: string;
  suggestion?: string;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

const scoreColor = (s: number) => {
  if (s >= 85) return 'text-emerald-600';
  if (s >= 65) return 'text-amber-600';
  return 'text-red-600';
};

const ringColor = (s: number) => {
  if (s >= 85) return 'stroke-emerald-500';
  if (s >= 65) return 'stroke-amber-500';
  return 'stroke-red-500';
};

const pillColor = (s: number) => {
  if (s >= 85) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (s >= 65) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
};

const pillIcon = (s: number) => {
  if (s >= 85) return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (s >= 65) return <AlertTriangle className="h-3.5 w-3.5" />;
  return <XCircle className="h-3.5 w-3.5" />;
};

const OpsHealthCard: React.FC = () => {
  const { data, isLoading } = useHormoziData();
  const [sopCount, setSopCount] = useState<number | null>(null);
  const [loadingSops, setLoadingSops] = useState(true);

  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('training_courses' as any)
        .select('*', { count: 'exact', head: true })
        .eq('published', true);
      setSopCount(count || 0);
      setLoadingSops(false);
    })();
  }, []);

  if (isLoading || loadingSops || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-500" />
            Ops Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── PILLAR SCORES ──────────────────────────────────────────────
  // Each pillar returns 0-100.

  const sopScore = clamp(((sopCount || 0) / SOP_COVERAGE_TARGET) * 100);
  const sopPillar: Pillar = {
    key: 'sops',
    label: 'SOP Coverage',
    score: sopScore,
    detail: `${sopCount}/${SOP_COVERAGE_TARGET} published`,
    suggestion: sopScore < 85 ? `Publish ${SOP_COVERAGE_TARGET - (sopCount || 0)} more SOPs in Training tab` : undefined,
  };

  const dataIssues = (data.unclassified_charges || 0) + (data.unresolved_errors || 0) + (data.stuck_sequences || 0);
  const dataScore = clamp(100 - (dataIssues / DATA_HEALTH_MAX_ISSUES) * 100);
  const dataPillar: Pillar = {
    key: 'data',
    label: 'Data Health',
    score: dataScore,
    detail: `${dataIssues} issue${dataIssues === 1 ? '' : 's'} pending`,
    suggestion: dataScore < 85
      ? `Review ${data.unclassified_charges} unclassified charges, ${data.stuck_sequences} stuck sequences, ${data.unresolved_errors} errors`
      : undefined,
  };

  const unpaidCount = data.unpaid_invoices.length;
  const maxUnpaidAge = unpaidCount > 0 ? Math.max(...data.unpaid_invoices.map(u => u.age_days)) : 0;
  // penalty: count AND age (stale invoices hurt more)
  const countPenalty = (unpaidCount / UNPAID_INVOICES_MAX) * 60;
  const agePenalty = maxUnpaidAge > 7 ? 40 : maxUnpaidAge > 3 ? 20 : 0;
  const paymentsScore = clamp(100 - countPenalty - agePenalty);
  const paymentsPillar: Pillar = {
    key: 'payments',
    label: 'Payments',
    score: paymentsScore,
    detail: unpaidCount === 0
      ? 'No unpaid invoices'
      : `${unpaidCount} unpaid${maxUnpaidAge > 0 ? ` · oldest ${maxUnpaidAge}d` : ''}`,
    suggestion: paymentsScore < 85
      ? `Chase ${unpaidCount} unpaid invoice${unpaidCount === 1 ? '' : 's'} — auto-dunning has already fired`
      : undefined,
  };

  const retentionScore = clamp((data.repeat_rate_pct / REPEAT_RATE_TARGET) * 100);
  const retentionPillar: Pillar = {
    key: 'retention',
    label: 'Retention',
    score: retentionScore,
    detail: `${data.repeat_rate_pct.toFixed(1)}% repeat (target ${REPEAT_RATE_TARGET}%)`,
    suggestion: retentionScore < 85 ? 'Ship post-visit follow-up + review request automation' : undefined,
  };

  const activityScore = clamp((data.visits_mtd / VISITS_MTD_TARGET) * 100);
  const activityPillar: Pillar = {
    key: 'activity',
    label: 'Activity',
    score: activityScore,
    detail: `${data.visits_mtd}/${VISITS_MTD_TARGET} visits MTD`,
    suggestion: activityScore < 85 ? `${VISITS_MTD_TARGET - data.visits_mtd} more visits to clear Level-0 gate` : undefined,
  };

  const pillars = [sopPillar, dataPillar, paymentsPillar, retentionPillar, activityPillar];
  const overall = Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length);

  // Worst pillar for the headline message
  const worst = [...pillars].sort((a, b) => a.score - b.score)[0];

  // SVG ring dimensions
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - overall / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-gray-500" />
          Ops Health
          <span className="text-xs font-normal text-gray-400 ml-auto">Single-pulse score</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          {/* Gauge */}
          <div className="relative h-32 w-32 flex-shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r={radius}
                className="stroke-gray-100"
                strokeWidth="10"
                fill="none"
              />
              <circle
                cx="60"
                cy="60"
                r={radius}
                className={`${ringColor(overall)} transition-all duration-500`}
                strokeWidth="10"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-3xl font-bold ${scoreColor(overall)}`}>{overall}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">out of 100</div>
            </div>
          </div>

          {/* Headline + worst pillar suggestion */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {overall >= 85 && 'Healthy — keep shipping.'}
              {overall >= 65 && overall < 85 && 'Watch list — one pillar slipping.'}
              {overall < 65 && 'Attention needed — score below 65.'}
            </p>
            {worst.suggestion && (
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                <span className="font-medium text-gray-700">Next move:</span> {worst.suggestion}
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-2 italic">
              Updated with dashboard refresh · green ≥85, amber 65-84, red &lt;65
            </p>
          </div>
        </div>

        {/* Pillar breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-5">
          {pillars.map((p) => (
            <div
              key={p.key}
              className={`border rounded-lg px-3 py-2 ${pillColor(p.score)}`}
              title={p.suggestion || p.detail}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{p.label}</span>
                {pillIcon(p.score)}
              </div>
              <div className="text-xl font-bold mt-0.5">{Math.round(p.score)}</div>
              <div className="text-[11px] opacity-80 truncate">{p.detail}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default OpsHealthCard;
