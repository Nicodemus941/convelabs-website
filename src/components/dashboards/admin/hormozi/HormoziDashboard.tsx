import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Target, AlertTriangle,
  Activity, Percent, Repeat, Loader2,
} from 'lucide-react';
import { useHormoziData, MARGIN_TARGET_PCT } from '@/hooks/useHormoziData';
import DataHealthCard from './DataHealthCard';
import ActiveSubscriptionsCard from './ActiveSubscriptionsCard';
import AcquisitionByChannel from './AcquisitionByChannel';
import RevenueTypeSplit from './RevenueTypeSplit';
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

/**
 * HORMOZI DASHBOARD — The Accountability Screen
 *
 * Per the master plan (Part C9): one page that answers the three
 * questions that actually change behavior:
 *   1. Are we making or losing money this month?
 *   2. Which patients / channels / services print cash?
 *   3. What needs my attention before it costs me money?
 *
 * Everything else is accounting theater. This screen is not.
 */

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(n || 0);

const fmtMoneyPrecise = (n: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);

const fmtPct = (n: number): string => `${(n || 0).toFixed(1)}%`;

interface KpiProps {
  label: string;
  value: string;
  subtext?: string;
  subtextColor?: 'green' | 'red' | 'amber' | 'muted';
  icon: React.ComponentType<{ className?: string }>;
  emphasis?: boolean;
  trend?: number[]; // optional 14-day daily series
  trendLabel?: string;
}

const Kpi: React.FC<KpiProps> = ({ label, value, subtext, subtextColor = 'muted', icon: Icon, emphasis, trend, trendLabel }) => {
  const subColor = {
    green: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    muted: 'text-gray-500',
  }[subtextColor];

  return (
    <Card className={emphasis ? 'border-conve-red/30 shadow-md' : ''}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${emphasis ? 'text-conve-red' : 'text-gray-400'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${emphasis ? 'text-conve-red' : 'text-gray-900'}`}>{value}</div>
        {subtext && <p className={`text-xs mt-1 ${subColor}`}>{subtext}</p>}
        {trend && trend.length >= 2 && (
          <div className="mt-2">
            <TrendSparkline
              values={trend}
              width={110}
              height={24}
              strokeColor={emphasis ? '#B91C1C' : '#6B7280'}
              showDelta
              ariaLabel={trendLabel || `${label} — last 14 days`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const HormoziDashboard: React.FC = () => {
  const { data, isLoading, error, refetch, isFetching } = useHormoziData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-conve-red" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 mb-4">Failed to load dashboard data.</p>
        <button onClick={() => refetch()} className="px-4 py-2 bg-conve-red text-white rounded-md">Retry</button>
      </div>
    );
  }

  const mtdVsLast = data.revenue_last_month > 0
    ? ((data.revenue_projected_month_end - data.revenue_last_month) / data.revenue_last_month) * 100
    : 0;

  const marginVsTarget = data.estimated_gross_margin_pct - MARGIN_TARGET_PCT;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Hormozi Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            The numbers that actually change decisions. Updated every 2 minutes.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="px-3 py-1.5 text-xs border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
        >
          {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ─── ACTIVE CAMPAIGN ROI (auto-hides when none) ───────────── */}
      <section>
        <CampaignROICard />
      </section>

      {/* ─── CAMPAIGN ENGAGEMENT (live opens/clicks for the most recent broadcast) ─── */}
      <section>
        <CampaignEngagementCard />
      </section>

      {/* ─── CHATBOT ROI (auto-hides when no convos) ──────────────── */}
      <section>
        <ChatROICard />
      </section>

      {/* ─── OPS HEALTH PULSE (Part I2 Phase 1) ───────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Operational Pulse</h2>
        <OpsHealthCard />
      </section>

      {/* ─── BREAK-EVEN TRACKER (owner-pay $5K/mo target) ─────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">This month at a glance</h2>
        <BreakEvenTracker />
      </section>

      {/* ─── LAB ORDER REQUEST FUNNEL (Sprint 2 metric) ───────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Patient self-service</h2>
        <LabOrderFunnelCard />
      </section>

      {/* ─── LEVEL 0 GATE TRACKER (master plan Part B) ───────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Gate Progress</h2>
        <Level0Tracker />
      </section>

      {/* ─── HEADLINE NUMBERS ─────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Revenue</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Today"
            value={fmtMoney(data.revenue_today)}
            icon={DollarSign}
            trend={data.revenue_daily_14d}
            trendLabel="Daily revenue — last 14 days"
          />
          <Kpi
            label="This Month"
            value={fmtMoney(data.revenue_mtd)}
            subtext={`${data.visits_mtd} completed visits`}
            icon={TrendingUp}
            emphasis
            trend={data.visits_daily_14d}
            trendLabel="Daily visits — last 14 days"
          />
          <Kpi
            label="Projected End-of-Month"
            value={fmtMoney(data.revenue_projected_month_end)}
            subtext={
              data.revenue_last_month > 0
                ? `${mtdVsLast >= 0 ? '+' : ''}${fmtPct(mtdVsLast)} vs last month`
                : 'No prior month data'
            }
            subtextColor={mtdVsLast >= 0 ? 'green' : 'red'}
            icon={Target}
          />
          <Kpi
            label="Last Month (final)"
            value={fmtMoney(data.revenue_last_month)}
            icon={Activity}
          />
        </div>
      </section>

      {/* ─── UNIT ECONOMICS ───────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Unit Economics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Avg Revenue / Visit"
            value={fmtMoneyPrecise(data.avg_visit_revenue)}
            subtext={`MTD across ${data.visits_mtd} visits`}
            icon={DollarSign}
          />
          <Kpi
            label="Estimated Gross Margin"
            value={fmtPct(data.estimated_gross_margin_pct)}
            subtext={
              marginVsTarget >= 0
                ? `+${fmtPct(marginVsTarget)} above target`
                : `${fmtPct(marginVsTarget)} below target (${MARGIN_TARGET_PCT}%)`
            }
            subtextColor={marginVsTarget >= 0 ? 'green' : 'red'}
            icon={Percent}
            emphasis
          />
          <Kpi
            label="Estimated COGS (MTD)"
            value={fmtMoney(data.estimated_cogs)}
            subtext="Phleb $55 + supplies $10 + Stripe fees"
            icon={TrendingDown}
          />
          <Kpi
            label="Estimated Profit (MTD)"
            value={fmtMoney(data.estimated_gross_profit)}
            subtextColor={data.estimated_gross_profit >= 0 ? 'green' : 'red'}
            subtext={data.estimated_gross_profit >= 0 ? 'Before fixed costs' : 'Losing money'}
            icon={TrendingUp}
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-2 italic">
          Margin estimate assumes $55/visit phleb + $10/visit supplies. Replace with actual phleb_payouts once payroll automation ships.
        </p>
      </section>

      {/* ─── RETENTION ────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Patient Retention</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Total Patients"
            value={String(data.total_patients)}
            icon={Users}
          />
          <Kpi
            label="Repeat Patients"
            value={String(data.repeat_patients)}
            subtext={`${data.total_patients > 0 ? '' : ''}${data.total_patients} total`}
            icon={Repeat}
          />
          <Kpi
            label="Repeat Rate"
            value={fmtPct(data.repeat_rate_pct)}
            subtextColor={data.repeat_rate_pct >= 30 ? 'green' : 'amber'}
            subtext={
              data.repeat_rate_pct >= 30
                ? 'Hitting Level 0 target (≥30%)'
                : 'Below Level 0 gate (30%)'
            }
            icon={Percent}
            emphasis={data.repeat_rate_pct < 30}
          />
          <Kpi
            label="New Patients (30d)"
            value={String(data.new_patients_30d)}
            icon={TrendingUp}
          />
        </div>
      </section>

      {/* ─── REVENUE BY TYPE + CHANNEL ────────────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Income Type (MTD)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.revenue_by_type.length === 0 ? (
              <p className="text-sm text-gray-500">No revenue this month yet.</p>
            ) : (
              <div className="space-y-2">
                {data.revenue_by_type.map((r) => {
                  const pct = data.revenue_mtd > 0 ? (r.amount / data.revenue_mtd) * 100 : 0;
                  return (
                    <div key={r.type} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium capitalize">{r.type}</span>
                        <span className="text-gray-600">
                          {fmtMoney(r.amount)} <span className="text-gray-400">· {r.count} charge{r.count !== 1 ? 's' : ''}</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-conve-red"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acquisition Channels (all-time)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.channels.length === 0 ? (
              <p className="text-sm text-gray-500">No channel data yet.</p>
            ) : (
              <div className="space-y-2">
                {data.channels.slice(0, 6).map((c) => (
                  <div key={c.channel} className="flex items-center justify-between text-sm">
                    <span className="font-medium capitalize">{c.channel.replace(/_/g, ' ')}</span>
                    <div className="text-right">
                      <div className="font-medium">{fmtMoney(c.revenue)}</div>
                      <div className="text-[11px] text-gray-500">
                        {c.patients} patient{c.patients !== 1 ? 's' : ''} · {fmtMoney(c.avg_revenue_per_patient)} avg
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ─── LTV COHORTS ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LTV by Acquisition Cohort (last 6 months)</CardTitle>
          <p className="text-xs text-gray-500">Average cumulative revenue per patient, grouped by the month they first booked.</p>
        </CardHeader>
        <CardContent>
          {data.cohorts.length === 0 ? (
            <p className="text-sm text-gray-500">No cohort data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left py-2">Cohort Month</th>
                    <th className="text-right py-2">Patients</th>
                    <th className="text-right py-2">Total Revenue</th>
                    <th className="text-right py-2">Avg LTV</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((c) => (
                    <tr key={c.cohort_month} className="border-t border-gray-100">
                      <td className="py-2 font-medium">{c.cohort_month}</td>
                      <td className="text-right py-2">{c.patients}</td>
                      <td className="text-right py-2">{fmtMoney(c.total_revenue)}</td>
                      <td className="text-right py-2 font-semibold">{fmtMoney(c.avg_ltv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── REVENUE SPLIT (I3: Profit First bucketing by revenue type) ─ */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Revenue Type Split</h2>
        <RevenueTypeSplit />
      </section>

      {/* ─── ACQUISITION (Level 0: "CAC documented per channel") ───── */}
      <section className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Acquisition</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AcquisitionByChannel />
          <TrafficCard />
        </div>
      </section>

      {/* ─── ATTENTION ITEMS ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Needs Attention</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <DataHealthCard />
          <ActiveSubscriptionsCard />
          <ReviewsWidget />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Top Unpaid Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.unpaid_invoices.length === 0 ? (
                <p className="text-sm text-emerald-600">✓ No unpaid invoices.</p>
              ) : (
                <div className="space-y-2">
                  {data.unpaid_invoices.map((u) => (
                    <div key={u.id} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0">
                      <div>
                        <div className="font-medium">{u.patient_name || 'Unknown patient'}</div>
                        <div className="text-xs text-gray-500">{u.age_days} days old</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{fmtMoney(u.amount)}</span>
                        <Badge variant="outline" className={u.age_days > 7 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                          {u.age_days > 7 ? 'Stale' : 'Open'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-gray-500" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Unclassified Stripe charges</span>
                  <span className={`font-semibold ${data.unclassified_charges > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {data.unclassified_charges}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Refunded (MTD)</span>
                  <span className="font-semibold">{fmtMoney(data.refunded_mtd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Stuck post-visit sequences</span>
                  <span className={`font-semibold ${data.stuck_sequences > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {data.stuck_sequences}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Unresolved errors (30d)</span>
                  <span className={`font-semibold ${data.unresolved_errors > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {data.unresolved_errors}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-gray-600">Stripe fees (MTD)</span>
                  <span>{fmtMoneyPrecise(data.stripe_fees_mtd)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ─── MILESTONE GATE ───────────────────────────────────────── */}
      <Card className="bg-gray-50 border-gray-200">
        <CardHeader>
          <CardTitle className="text-base">Level Check</CardTitle>
          <p className="text-xs text-gray-500">From the master plan — current level gate status.</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span>30+ visits/mo (Level 0)</span>
              <Badge variant="outline" className={data.visits_mtd >= 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600'}>
                {data.visits_mtd}/30 {data.visits_mtd >= 30 ? '✓' : ''}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>40+ visits/mo — hire first phleb (Level 1 gate)</span>
              <Badge variant="outline" className={data.visits_mtd >= 40 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600'}>
                {data.visits_mtd}/40 {data.visits_mtd >= 40 ? '✓' : ''}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>30%+ repeat rate (Level 0 gate)</span>
              <Badge variant="outline" className={data.repeat_rate_pct >= 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600'}>
                {fmtPct(data.repeat_rate_pct)}/30% {data.repeat_rate_pct >= 30 ? '✓' : ''}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>$15K MRR — Level 2 gate</span>
              <Badge variant="outline" className={data.revenue_projected_month_end >= 15000 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600'}>
                {fmtMoney(data.revenue_projected_month_end)}/{fmtMoney(15000)} {data.revenue_projected_month_end >= 15000 ? '✓' : ''}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HormoziDashboard;
