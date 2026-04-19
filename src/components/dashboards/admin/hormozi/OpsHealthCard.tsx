import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useHormoziData } from '@/hooks/useHormoziData';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

/**
 * OpsHealthCard — weighted composite score tuned to the business stage.
 *
 * Hormozi principle: not all pillars matter equally. A pre-$1M business
 * with perfect SOPs and zero demand is still broken; a $3M business
 * with messy SOPs and strong demand still wins. Weights shift by stage.
 *
 * Upgrades in this pass (J3 → J4):
 *   • Stage-adjusted weighting (auto-detected from visits_mtd, overridable)
 *   • 7-day trend arrow on overall + each pillar (self-seeded via upsert)
 *   • Clickable "Fix this" CTAs per pillar with deep-links to admin tabs
 */

const SOP_COVERAGE_TARGET = 20;
const DATA_HEALTH_MAX_ISSUES = 10;
const UNPAID_INVOICES_MAX = 5;
const VISITS_MTD_TARGET = 30;
const REPEAT_RATE_TARGET = 30;

type Stage = 'pre_1m' | 'growth' | 'scale';

interface PillarKey {
  key: 'sops' | 'data' | 'payments' | 'retention' | 'activity';
}

const PILLAR_LABELS: Record<PillarKey['key'], string> = {
  sops: 'SOP Coverage',
  data: 'Data Health',
  payments: 'Payments',
  retention: 'Retention',
  activity: 'Activity',
};

// Stage-adjusted weights — sum to 100 per column.
// Rationale: pre-$1M companies live or die by demand + collection; at
// growth stage the SOP discipline starts to matter; at scale stage
// SOPs and data hygiene become the load-bearing structure.
const STAGE_WEIGHTS: Record<Stage, Record<PillarKey['key'], number>> = {
  pre_1m: { activity: 30, payments: 25, retention: 20, data: 15, sops: 10 },
  growth: { activity: 20, payments: 20, retention: 15, data: 20, sops: 25 },
  scale:  { activity: 15, payments: 15, retention: 10, data: 25, sops: 35 },
};

const STAGE_LABEL: Record<Stage, string> = {
  pre_1m: 'Pre-$1M · prove demand',
  growth: '$1M–$10M · team executes',
  scale:  '$10M+ · systems replicate',
};

// Stage auto-detect from visits_mtd. Crude but good enough; owner can
// override via the segmented control.
function detectStage(visits_mtd: number): Stage {
  if (visits_mtd < 100) return 'pre_1m';
  if (visits_mtd < 400) return 'growth';
  return 'scale';
}

interface Pillar {
  key: PillarKey['key'];
  label: string;
  score: number;
  detail: string;
  suggestion?: string;
  ctaHref: string;
  ctaLabel: string;
}

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const scoreColor = (s: number) => (s >= 85 ? 'text-emerald-600' : s >= 65 ? 'text-amber-600' : 'text-red-600');
const ringColor  = (s: number) => (s >= 85 ? 'stroke-emerald-500' : s >= 65 ? 'stroke-amber-500' : 'stroke-red-500');
const pillColor  = (s: number) => (
  s >= 85 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
  : s >= 65 ? 'bg-amber-50 text-amber-700 border-amber-200'
  : 'bg-red-50 text-red-700 border-red-200'
);
const pillIcon = (s: number) =>
  s >= 85 ? <CheckCircle2 className="h-3.5 w-3.5" />
  : s >= 65 ? <AlertTriangle className="h-3.5 w-3.5" />
  : <XCircle className="h-3.5 w-3.5" />;

// Tiny trend pill: ↑N / ↓N / — vs 7 days ago
function TrendPill({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[10px] text-gray-400">—</span>;
  if (delta === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
      <Minus className="h-2.5 w-2.5" /> 0
    </span>
  );
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(delta)}
    </span>
  );
}

const OpsHealthCard: React.FC = () => {
  const { user } = useAuth();
  const basePath = `/dashboard/${user?.role || 'super_admin'}`;

  const { data, isLoading } = useHormoziData();
  const [sopCount, setSopCount] = useState<number | null>(null);
  const [loadingSops, setLoadingSops] = useState(true);
  const [stageOverride, setStageOverride] = useState<Stage | null>(null);
  const [priorSnapshot, setPriorSnapshot] = useState<any>(null);

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

  // Pull the 7-days-ago snapshot for trend comparison
  useEffect(() => {
    (async () => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      const iso = d.toISOString().slice(0, 10);
      const { data: prior } = await supabase
        .from('ops_health_snapshots' as any)
        .select('*')
        .eq('snapshot_date', iso)
        .maybeSingle();
      setPriorSnapshot(prior || null);
    })();
  }, []);

  const { pillars, overall, stage } = useMemo(() => {
    if (!data || sopCount === null) {
      return { pillars: [] as Pillar[], overall: 0, stage: 'pre_1m' as Stage };
    }

    const autoStage = detectStage(data.visits_mtd || 0);
    const activeStage: Stage = stageOverride || autoStage;
    const weights = STAGE_WEIGHTS[activeStage];

    // Pillar scores (each 0-100 regardless of weight)
    const sopScore = clamp(((sopCount || 0) / SOP_COVERAGE_TARGET) * 100);
    const dataIssues = (data.unclassified_charges || 0) + (data.unresolved_errors || 0) + (data.stuck_sequences || 0);
    const dataScore = clamp(100 - (dataIssues / DATA_HEALTH_MAX_ISSUES) * 100);

    const unpaidCount = data.unpaid_invoices.length;
    const maxUnpaidAge = unpaidCount > 0 ? Math.max(...data.unpaid_invoices.map((u: any) => u.age_days)) : 0;
    const countPenalty = (unpaidCount / UNPAID_INVOICES_MAX) * 60;
    const agePenalty = maxUnpaidAge > 7 ? 40 : maxUnpaidAge > 3 ? 20 : 0;
    const paymentsScore = clamp(100 - countPenalty - agePenalty);

    const retentionScore = clamp((data.repeat_rate_pct / REPEAT_RATE_TARGET) * 100);
    const activityScore = clamp((data.visits_mtd / VISITS_MTD_TARGET) * 100);

    const p: Pillar[] = [
      {
        key: 'activity',
        label: PILLAR_LABELS.activity,
        score: activityScore,
        detail: `${data.visits_mtd}/${VISITS_MTD_TARGET} visits MTD`,
        suggestion: activityScore < 85 ? `${Math.max(0, VISITS_MTD_TARGET - data.visits_mtd)} more visits clears Level-0 gate` : undefined,
        ctaHref: `${basePath}/appointments`,
        ctaLabel: 'Open appointments',
      },
      {
        key: 'payments',
        label: PILLAR_LABELS.payments,
        score: paymentsScore,
        detail: unpaidCount === 0 ? 'No unpaid invoices' : `${unpaidCount} unpaid${maxUnpaidAge > 0 ? ` · oldest ${maxUnpaidAge}d` : ''}`,
        suggestion: paymentsScore < 85 ? `Chase ${unpaidCount} unpaid · dunning already fired` : undefined,
        ctaHref: `${basePath}/invoices`,
        ctaLabel: 'Open invoices',
      },
      {
        key: 'retention',
        label: PILLAR_LABELS.retention,
        score: retentionScore,
        detail: `${data.repeat_rate_pct.toFixed(1)}% repeat (target ${REPEAT_RATE_TARGET}%)`,
        suggestion: retentionScore < 85 ? 'Check LTV cohorts + post-visit sequences' : undefined,
        ctaHref: `${basePath}/hormozi`,
        ctaLabel: 'Open LTV cohorts',
      },
      {
        key: 'data',
        label: PILLAR_LABELS.data,
        score: dataScore,
        detail: `${dataIssues} issue${dataIssues === 1 ? '' : 's'} pending`,
        suggestion: dataScore < 85
          ? `${data.unclassified_charges || 0} unclassified · ${data.stuck_sequences || 0} stuck · ${data.unresolved_errors || 0} errors`
          : undefined,
        ctaHref: `${basePath}/operations`,
        ctaLabel: 'Open operations',
      },
      {
        key: 'sops',
        label: PILLAR_LABELS.sops,
        score: sopScore,
        detail: `${sopCount}/${SOP_COVERAGE_TARGET} published`,
        suggestion: sopScore < 85 ? `Publish ${Math.max(0, SOP_COVERAGE_TARGET - (sopCount || 0))} more SOPs` : undefined,
        ctaHref: `${basePath}/training`,
        ctaLabel: 'Open training',
      },
    ];

    // Weighted overall
    const overallWeighted = Math.round(
      p.reduce((sum, pillar) => sum + pillar.score * (weights[pillar.key] / 100), 0)
    );

    return { pillars: p, overall: overallWeighted, stage: activeStage };
  }, [data, sopCount, stageOverride, basePath]);

  // Upsert today's snapshot so trends build over time (idempotent by date)
  useEffect(() => {
    if (!pillars.length || overall === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const p = Object.fromEntries(pillars.map(x => [x.key, x.score]));
    supabase
      .from('ops_health_snapshots' as any)
      .upsert({
        snapshot_date: today,
        overall_score: overall,
        activity_score: Math.round(p.activity),
        payments_score: Math.round(p.payments),
        retention_score: Math.round(p.retention),
        data_score: Math.round(p.data),
        sop_score: Math.round(p.sops),
        stage,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'snapshot_date' })
      .then(() => { /* fire-and-forget */ });
  }, [pillars, overall, stage]);

  const deltas = useMemo(() => {
    if (!priorSnapshot) return { overall: null, sops: null, data: null, payments: null, retention: null, activity: null } as Record<string, number | null>;
    return {
      overall: overall - (priorSnapshot.overall_score ?? overall),
      sops: (pillars.find(p => p.key === 'sops')?.score ?? 0) - (priorSnapshot.sop_score ?? 0),
      data: (pillars.find(p => p.key === 'data')?.score ?? 0) - (priorSnapshot.data_score ?? 0),
      payments: (pillars.find(p => p.key === 'payments')?.score ?? 0) - (priorSnapshot.payments_score ?? 0),
      retention: (pillars.find(p => p.key === 'retention')?.score ?? 0) - (priorSnapshot.retention_score ?? 0),
      activity: (pillars.find(p => p.key === 'activity')?.score ?? 0) - (priorSnapshot.activity_score ?? 0),
    };
  }, [priorSnapshot, pillars, overall]);

  if (isLoading || loadingSops || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-gray-500" /> Ops Health
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

  const worst = [...pillars].sort((a, b) => a.score - b.score)[0];
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - overall / 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Activity className="h-4 w-4 text-gray-500" /> Ops Health
          <span className="text-[10px] font-normal text-gray-500 ml-1">· {STAGE_LABEL[stage]}</span>

          {/* Stage override segmented control */}
          <div className="ml-auto inline-flex items-center gap-1 bg-gray-100 rounded-md p-0.5 text-[10px] font-medium">
            {(['pre_1m', 'growth', 'scale'] as Stage[]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStageOverride(stageOverride === s ? null : s)}
                className={`px-2 py-0.5 rounded ${stageOverride === s ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                title={stageOverride === s ? 'Click to revert to auto-detect' : `Override weights to ${s}`}
              >
                {s === 'pre_1m' ? '<$1M' : s === 'growth' ? '$1–10M' : '$10M+'}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          {/* Gauge */}
          <div className="relative h-32 w-32 flex-shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={radius} className="stroke-gray-100" strokeWidth="10" fill="none" />
              <circle
                cx="60" cy="60" r={radius}
                className={`${ringColor(overall)} transition-all duration-500`}
                strokeWidth="10" fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className={`text-3xl font-bold ${scoreColor(overall)}`}>{overall}</div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">out of 100</div>
              <div className="mt-0.5"><TrendPill delta={deltas.overall} /> <span className="text-[9px] text-gray-400">7d</span></div>
            </div>
          </div>

          {/* Headline + next move */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {overall >= 85 && 'Healthy — keep shipping.'}
              {overall >= 65 && overall < 85 && 'Watch list — one pillar slipping.'}
              {overall < 65 && 'Attention needed — score below 65.'}
            </p>
            {worst?.suggestion && (
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                <span className="font-medium text-gray-700">Next move:</span> {worst.suggestion}
                {' · '}
                <Link to={worst.ctaHref} className="text-conve-red hover:underline font-medium inline-flex items-center gap-0.5">
                  {worst.ctaLabel} <ArrowRight className="h-3 w-3" />
                </Link>
              </p>
            )}
            <p className="text-[11px] text-gray-400 mt-2 italic">
              Weights tuned for {STAGE_LABEL[stage].split(' · ')[0]} · green ≥85 · 7-day trend on each pillar
            </p>
          </div>
        </div>

        {/* Pillar breakdown with clickable CTAs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-5">
          {pillars.map((p) => {
            const delta = (deltas as any)[p.key] ?? null;
            return (
              <Link
                key={p.key}
                to={p.ctaHref}
                className={`group border rounded-lg px-3 py-2 transition hover:shadow-md ${pillColor(p.score)}`}
                title={p.suggestion || p.detail}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider truncate">{p.label}</span>
                  {pillIcon(p.score)}
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <div className="text-xl font-bold">{Math.round(p.score)}</div>
                  <TrendPill delta={delta} />
                </div>
                <div className="text-[11px] opacity-80 truncate">{p.detail}</div>
                <div className="mt-1 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-0.5">
                  {p.ctaLabel} <ArrowRight className="h-2.5 w-2.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default OpsHealthCard;
