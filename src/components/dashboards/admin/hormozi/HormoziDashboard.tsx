/**
 * HORMOZI DASHBOARD — Owner › Growth model (owner-gated in Dashboard.tsx).
 *
 * One page that answers the three questions that actually change behavior:
 *   1. Are we making or losing money this month?
 *   2. Which patients / channels / services print cash?
 *   3. What needs my attention before it costs me money?
 *
 * 2026-10-02 redesign (LabOrdersTab language): header + right-aligned
 * actions, a sticky jump bar so the fifteen cards are navigable, KPI tiles
 * in the shared tile shell, tables with a sticky Actions column + mobile
 * cards. Every card and every number from the previous version is still
 * here; only the chrome changed. Data comes from useHormoziData plus the
 * per-card hooks each sub-card already owned.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Target, AlertTriangle, Activity, Percent, Repeat,
  RefreshCw, Calendar, BarChart3, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { useHormoziData, MARGIN_TARGET_PCT } from '@/hooks/useHormoziData';
import DataHealthCard from './DataHealthCard';
import ActiveSubscriptionsCard from './ActiveSubscriptionsCard';
import AcquisitionByChannel from './AcquisitionByChannel';
import RevenueTypeSplit from './RevenueTypeSplit';
import MoneyFlowCard from './MoneyFlowCard';
import Level0Tracker from './Level0Tracker';
import BreakEvenTracker from './BreakEvenTracker';
import LabOrderFunnelCard from './LabOrderFunnelCard';
import ReviewsWidget from './ReviewsWidget';
import OpsHealthCard from './OpsHealthCard';
import TrendSparkline from './TrendSparkline';
import CampaignROICard from './CampaignROICard';
import CampaignEngagementCard from './CampaignEngagementCard';
import ChatROICard from './ChatROICard';
import TrafficCard from './TrafficCard';
import {
  SectionHeader, SectionTitle, KpiTile, Pill, LoadingTiles, ErrorBanner, Th, ThActions, TdActions, fmtMoney, fmtMoneyPrecise, fmtPct, fmtInt,
} from '../owner/sectionUi';

const BASE = '/dashboard/super_admin';

const JUMPS: Array<{ id: string; label: string }> = [
  { id: 'hz-pulse', label: 'Pulse' },
  { id: 'hz-month', label: 'This month' },
  { id: 'hz-revenue', label: 'Revenue' },
  { id: 'hz-unit', label: 'Unit economics' },
  { id: 'hz-retention', label: 'Retention' },
  { id: 'hz-ltv', label: 'LTV' },
  { id: 'hz-money', label: 'Money flow' },
  { id: 'hz-acq', label: 'Acquisition' },
  { id: 'hz-attention', label: 'Needs attention' },
  { id: 'hz-level', label: 'Level check' },
];

const Kpi: React.FC<{
  label: string; value: string; subtext?: string; subtextColor?: 'green' | 'red' | 'amber' | 'muted';
  icon: React.ComponentType<{ className?: string }>; emphasis?: boolean; trend?: number[]; trendLabel?: string;
}> = ({ label, value, subtext, subtextColor = 'muted', icon, emphasis, trend, trendLabel }) => {
  const tone = emphasis ? 'brand' : subtextColor === 'green' ? 'green' : subtextColor === 'red' ? 'red' : subtextColor === 'amber' ? 'amber' : 'default';
  return (
    <KpiTile
      label={label}
      value={value}
      icon={icon}
      tone={emphasis ? 'brand' : 'default'}
      hint={subtext ? <span className={cn(tone === 'green' && 'text-emerald-700', tone === 'red' && 'text-red-700', tone === 'amber' && 'text-amber-700')}>{subtext}</span> : undefined}
    >
      {trend && trend.length >= 2 && (
        <div className="mt-1.5">
          <TrendSparkline values={trend} width={110} height={24} strokeColor={emphasis ? '#B91C1C' : '#6B7280'} showDelta ariaLabel={trendLabel || `${label} — last 14 days`} />
        </div>
      )}
    </KpiTile>
  );
};

const HormoziDashboard: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useHormoziData();
  const [activeJump, setActiveJump] = useState<string>(JUMPS[0].id);

  // Highlight the jump chip for the section nearest the top of the viewport.
  useEffect(() => {
    if (!data) return;
    const els = JUMPS.map(j => document.getElementById(j.id)).filter(Boolean) as HTMLElement[];
    if (els.length === 0) return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveJump(visible[0].target.id);
    }, { rootMargin: '-96px 0px -70% 0px', threshold: 0 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [data]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveJump(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SectionHeader icon={BarChart3} title="Growth model" subtitle="The numbers that actually change decisions." />
        <LoadingTiles n={4} />
        <LoadingTiles n={4} />
        <div className="h-40 rounded-lg border border-gray-200 bg-gray-50 animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <SectionHeader icon={BarChart3} title="Growth model" subtitle="The numbers that actually change decisions." />
        <ErrorBanner title="Couldn't load the growth model" message={(error as any)?.message || 'No data returned'} onRetry={() => refetch()} />
      </div>
    );
  }

  const mtdVsLast = data.revenue_last_month > 0
    ? ((data.revenue_projected_month_end - data.revenue_last_month) / data.revenue_last_month) * 100 : 0;
  const marginVsTarget = data.estimated_gross_margin_pct - MARGIN_TARGET_PCT;

  const gates = [
    { label: '30+ visits / mo (Level 0)', met: data.visits_mtd >= 30, value: `${fmtInt(data.visits_mtd)}/30` },
    { label: '40+ visits / mo — hire first phleb (Level 1 gate)', met: data.visits_mtd >= 40, value: `${fmtInt(data.visits_mtd)}/40` },
    { label: '30%+ repeat rate (Level 0 gate)', met: data.repeat_rate_pct >= 30, value: `${fmtPct(data.repeat_rate_pct)}/30%` },
    { label: '$15K MRR — Level 2 gate', met: data.revenue_projected_month_end >= 15000, value: `${fmtMoney(data.revenue_projected_month_end)}/${fmtMoney(15000)}` },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        icon={BarChart3}
        title="Growth model"
        subtitle={<>The numbers that actually change decisions. Live, with a 2-minute background refresh.{dataUpdatedAt ? <span className="text-gray-400"> · updated {format(new Date(dataUpdatedAt), 'h:mm a')}</span> : null}</>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5 text-xs h-10 sm:h-9 min-w-10 sm:min-w-9" disabled={isFetching} aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
              <span className="hidden sm:inline">{isFetching ? 'Refreshing…' : 'Refresh'}</span>
            </Button>
            <Button size="sm" className="bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs h-10 sm:h-9 gap-1.5" asChild>
              <Link to={`${BASE}/owner/overview`}><DollarSign className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Business metrics</span><span className="sm:hidden">Metrics</span></Link>
            </Button>
          </>
        }
      />

      {/* Jump bar */}
      <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-1.5 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5" role="navigation" aria-label="Sections">
          {JUMPS.map(j => (
            <button key={j.id} type="button" onClick={() => jumpTo(j.id)} aria-current={activeJump === j.id ? 'location' : undefined}
              className={cn('inline-flex items-center h-8 px-3 rounded-full border text-xs font-medium whitespace-nowrap transition',
                activeJump === j.id ? 'bg-[#B91C1C] text-white border-[#B91C1C]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400')}>
              {j.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live campaign / chatbot cards — each auto-hides when it has nothing to say */}
      <CampaignROICard />
      <CampaignEngagementCard />
      <ChatROICard />

      <section id="hz-pulse" className="scroll-mt-16" aria-labelledby="hz-pulse-t">
        <SectionTitle id="hz-pulse-t">Operational pulse</SectionTitle>
        <OpsHealthCard />
      </section>

      <section id="hz-month" className="scroll-mt-16" aria-labelledby="hz-month-t">
        <SectionTitle id="hz-month-t">This month at a glance</SectionTitle>
        <div className="space-y-3">
          <BreakEvenTracker />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-gray-500 mb-1.5">Patient self-service</p>
              <LabOrderFunnelCard />
            </div>
            <div>
              <p className="text-[11px] text-gray-500 mb-1.5">Gate progress</p>
              <Level0Tracker />
            </div>
          </div>
        </div>
      </section>

      <section id="hz-revenue" className="scroll-mt-16" aria-labelledby="hz-revenue-t">
        <SectionTitle id="hz-revenue-t" hint="Stripe deposits · stripe_qb_sync_log">Revenue</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Today" value={fmtMoney(data.revenue_today)} icon={DollarSign} trend={data.revenue_daily_14d} trendLabel="Daily revenue — last 14 days" />
          <Kpi label="This month" value={fmtMoney(data.revenue_mtd)} subtext={`${fmtInt(data.visits_mtd)} completed visits`} icon={TrendingUp} emphasis trend={data.visits_daily_14d} trendLabel="Daily visits — last 14 days" />
          <Kpi label="Projected end of month" value={fmtMoney(data.revenue_projected_month_end)}
            subtext={data.revenue_last_month > 0 ? `${mtdVsLast >= 0 ? '+' : ''}${fmtPct(mtdVsLast)} vs last month` : 'No prior month data'}
            subtextColor={mtdVsLast >= 0 ? 'green' : 'red'} icon={Target} />
          <Kpi label="Last month (final)" value={fmtMoney(data.revenue_last_month)} icon={Activity} />
        </div>
      </section>

      <section id="hz-unit" className="scroll-mt-16" aria-labelledby="hz-unit-t">
        <SectionTitle id="hz-unit-t" hint={`target margin ${MARGIN_TARGET_PCT}%`}>Unit economics</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Avg revenue / visit" value={fmtMoneyPrecise(data.avg_visit_revenue)} subtext={`MTD across ${fmtInt(data.visits_mtd)} visits`} icon={DollarSign} />
          <Kpi label="Estimated gross margin" value={fmtPct(data.estimated_gross_margin_pct)}
            subtext={marginVsTarget >= 0 ? `+${fmtPct(marginVsTarget)} above target` : `${fmtPct(marginVsTarget)} below target (${MARGIN_TARGET_PCT}%)`}
            subtextColor={marginVsTarget >= 0 ? 'green' : 'red'} icon={Percent} emphasis />
          <Kpi label="Estimated COGS (MTD)" value={fmtMoney(data.estimated_cogs)} subtext="Phleb labor + supplies $10 + Stripe fees" icon={TrendingDown} />
          <Kpi label="Estimated profit (MTD)" value={fmtMoney(data.estimated_gross_profit)} subtextColor={data.estimated_gross_profit >= 0 ? 'green' : 'red'}
            subtext={data.estimated_gross_profit >= 0 ? 'Before fixed costs' : 'Losing money'} icon={TrendingUp} />
        </div>
        <p className="text-[11px] text-gray-400 mt-2 italic">
          Margin estimate: labor is $0 while phleb payouts are switched off (owner-operator), otherwise actual staff_payouts; supplies assumed $10/visit.
        </p>
      </section>

      <section id="hz-retention" className="scroll-mt-16" aria-labelledby="hz-retention-t">
        <SectionTitle id="hz-retention-t" hint="completed visits with a patient email">Patient retention</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Kpi label="Total patients" value={fmtInt(data.total_patients)} icon={Users} />
          <Kpi label="Repeat patients" value={fmtInt(data.repeat_patients)} subtext={`of ${fmtInt(data.total_patients)} total`} icon={Repeat} />
          <Kpi label="Repeat rate" value={fmtPct(data.repeat_rate_pct)} subtextColor={data.repeat_rate_pct >= 30 ? 'green' : 'amber'}
            subtext={data.repeat_rate_pct >= 30 ? 'Hitting Level 0 target (≥30%)' : 'Below Level 0 gate (30%)'} icon={Percent} emphasis={data.repeat_rate_pct < 30} />
          <Kpi label="New patients (30d)" value={fmtInt(data.new_patients_30d)} icon={TrendingUp} />
        </div>
      </section>

      {/* Revenue by type + channels */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">Revenue by income type (MTD)</CardTitle></CardHeader>
          <CardContent>
            {data.revenue_by_type.length === 0 ? <p className="text-sm text-gray-500">No revenue this month yet.</p> : (
              <div className="space-y-2">
                {data.revenue_by_type.map((r) => {
                  const pct = data.revenue_mtd > 0 ? (r.amount / data.revenue_mtd) * 100 : 0;
                  return (
                    <div key={r.type} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium capitalize">{r.type}</span>
                        <span className="text-gray-600 tabular-nums">{fmtMoney(r.amount)} <span className="text-gray-400">· {r.count} charge{r.count !== 1 ? 's' : ''}</span></span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#B91C1C] rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-base">Acquisition channels (all-time)</CardTitle></CardHeader>
          <CardContent>
            {data.channels.length === 0 ? <p className="text-sm text-gray-500">No channel data yet.</p> : (
              <div className="divide-y">
                {data.channels.slice(0, 6).map((c) => (
                  <div key={c.channel} className="flex items-center justify-between text-sm py-1.5">
                    <span className="font-medium capitalize">{c.channel.replace(/_/g, ' ')}</span>
                    <div className="text-right">
                      <div className="font-medium tabular-nums">{fmtMoney(c.revenue)}</div>
                      <div className="text-[11px] text-gray-500">{c.patients} patient{c.patients !== 1 ? 's' : ''} · {fmtMoney(c.avg_revenue_per_patient)} avg</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* LTV cohorts */}
      <section id="hz-ltv" className="scroll-mt-16 space-y-2" aria-labelledby="hz-ltv-t">
        <SectionTitle id="hz-ltv-t" hint="average cumulative revenue per patient, by first-booking month">LTV by acquisition cohort (last 6 months)</SectionTitle>
        {data.cohorts.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-gray-500">No cohort data yet.</CardContent></Card>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80">
                    <Th className="pl-4">Cohort month</Th>
                    <Th right>Patients</Th>
                    <Th right>Total revenue</Th>
                    <Th right>Avg LTV</Th>
                    <ThActions />
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort_month} className="border-t border-gray-100 hover:bg-gray-50/70">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-gray-800">{c.cohort_month}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmtInt(c.patients)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmtMoney(c.total_revenue)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{fmtMoney(c.avg_ltv)}</td>
                      <TdActions>
                        <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" asChild>
                          <Link to={`${BASE}/patients`}><Users className="h-3.5 w-3.5" aria-hidden="true" /> Patients</Link>
                        </Button>
                      </TdActions>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden space-y-2">
              {data.cohorts.map((c) => (
                <Card key={c.cohort_month} className="shadow-sm">
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{c.cohort_month}</p>
                      <p className="text-[11px] text-gray-500">{fmtInt(c.patients)} patients · {fmtMoney(c.total_revenue)} total</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">{fmtMoney(c.avg_ltv)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">avg LTV</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </section>

      <section id="hz-money" className="scroll-mt-16" aria-labelledby="hz-money-t">
        <SectionTitle id="hz-money-t" hint="last 30 days">Money flow</SectionTitle>
        <div className="space-y-3">
          <MoneyFlowCard days={30} />
          <div>
            <p className="text-[11px] text-gray-500 mb-1.5">Revenue type split · Profit First bucketing</p>
            <RevenueTypeSplit />
          </div>
        </div>
      </section>

      <section id="hz-acq" className="scroll-mt-16" aria-labelledby="hz-acq-t">
        <SectionTitle id="hz-acq-t" hint={<Link to={`${BASE}/growth`} className="text-[#B91C1C] hover:underline inline-flex items-center gap-0.5">Growth → traffic by channel <ChevronRight className="h-3 w-3" aria-hidden="true" /></Link>}>Acquisition</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <AcquisitionByChannel />
          <TrafficCard />
        </div>
      </section>

      <section id="hz-attention" className="scroll-mt-16 space-y-3" aria-labelledby="hz-attention-t">
        <SectionTitle id="hz-attention-t">Needs attention</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <DataHealthCard />
          <ActiveSubscriptionsCard />
          <ReviewsWidget />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" /> Top unpaid invoices</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.unpaid_invoices.length === 0 ? <p className="text-sm text-emerald-600 px-5 pb-4">✓ No unpaid invoices.</p> : (
                <div className="divide-y">
                  {data.unpaid_invoices.map((u) => (
                    <div key={u.id} className={cn('flex items-center justify-between gap-3 px-4 py-2.5', u.age_days > 7 && 'border-l-4 border-l-red-500')}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{u.patient_name || 'Unknown patient'}</p>
                        <p className="text-[11px] text-gray-500">{u.age_days} days old</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="font-semibold tabular-nums text-sm">{fmtMoney(u.amount)}</span>
                        <Pill className={u.age_days > 7 ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-800 border-amber-200'} dot={u.age_days > 7 ? 'bg-red-500' : 'bg-amber-500'}>{u.age_days > 7 ? 'Stale' : 'Open'}</Pill>
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0" aria-label="Open appointment" asChild>
                          <a href={`${BASE}/calendar?appointment=${u.id}`} target="_blank" rel="noopener noreferrer"><Calendar className="h-4 w-4" aria-hidden="true" /></a>
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 py-2">
                    <Button size="sm" variant="outline" className="h-9 text-xs" asChild><Link to={`${BASE}/billing/invoices`}>All invoices <ChevronRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" /></Link></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-gray-500" aria-hidden="true" /> System health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Unclassified Stripe charges', value: fmtInt(data.unclassified_charges), warn: data.unclassified_charges > 0 },
                  { label: 'Refunded (MTD)', value: fmtMoney(data.refunded_mtd), warn: false },
                  { label: 'Stuck post-visit sequences', value: fmtInt(data.stuck_sequences), warn: data.stuck_sequences > 0 },
                  { label: 'Unresolved errors (30d)', value: fmtInt(data.unresolved_errors), warn: data.unresolved_errors > 0 },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span className="text-gray-600">{r.label}</span>
                    <span className={cn('font-semibold tabular-nums', r.warn ? 'text-amber-600' : 'text-emerald-600')}>{r.value}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between"><span className="text-gray-600">Stripe fees (MTD)</span><span className="tabular-nums">{fmtMoneyPrecise(data.stripe_fees_mtd)}</span></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section id="hz-level" className="scroll-mt-16" aria-labelledby="hz-level-t">
        <SectionTitle id="hz-level-t" hint="from the master plan">Level check</SectionTitle>
        <Card className="shadow-sm">
          <CardContent className="p-0 divide-y">
            {gates.map(g => (
              <div key={g.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-gray-800">{g.label}</span>
                <Pill className={g.met ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-700 border-gray-200'} dot={g.met ? 'bg-emerald-500' : 'bg-gray-400'}>
                  {g.value}{g.met ? ' ✓' : ''}
                </Pill>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
};

export default HormoziDashboard;
