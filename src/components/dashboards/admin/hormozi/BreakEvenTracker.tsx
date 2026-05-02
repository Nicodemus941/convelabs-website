/**
 * BREAK-EVEN TRACKER — daily "where am I this month?"
 *
 * Per the Hormozi master plan Part D: track visits/mo + a simple traffic-
 * light status. The owner gave specific math:
 *   - Goal: 80 visits/mo @ $150 mobile = $5,040/mo phleb pay (42%)
 *   - Per-visit gross profit (after phleb pay + Stripe + supplies) = $72.35
 *   - Solo break-even: ~14 visits ($1,000/mo fixed cost ÷ $72.35)
 *   - With-assistant break-even: ~42 visits
 *
 * Three visible tiers, color-coded:
 *   🔴 Red    — below 14 visits → fixed costs not covered yet
 *   🟡 Yellow — 14–79 visits     → in the green, but not at $5K personal goal
 *   🟢 Green  — 80+ visits       → goal hit, every additional visit is upside
 *
 * Single SQL query to keep it cheap. Refreshes when the Hormozi Dashboard
 * refreshes (parent owns the polling cadence).
 */

import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, TrendingUp, AlertTriangle, Target, Trophy } from 'lucide-react';

const PER_VISIT_GROSS_PROFIT = 72.35;     // after phleb pay + Stripe + supplies
const PER_VISIT_PHLEB_PAY = 63;            // your 42% on a $150 mobile
const FIXED_BREAKEVEN_VISITS = 14;         // solo OpEx ~$1,000/mo
const PERSONAL_GOAL_VISITS = 80;           // 80 × $63 = $5,040/mo phleb pay

const BreakEvenTracker: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [visitsMtd, setVisitsMtd] = useState(0);
  const [daysElapsed, setDaysElapsed] = useState(1);
  const [daysInMonth, setDaysInMonth] = useState(30);

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const tzOffsetMs = 4 * 60 * 60 * 1000; // ET (-04:00) — close enough for daily counts
        const etNow = new Date(now.getTime() - tzOffsetMs);
        const monthStart = new Date(Date.UTC(etNow.getUTCFullYear(), etNow.getUTCMonth(), 1));
        const monthEnd = new Date(Date.UTC(etNow.getUTCFullYear(), etNow.getUTCMonth() + 1, 1));
        const dayOfMonth = etNow.getUTCDate();
        const totalDays = new Date(Date.UTC(etNow.getUTCFullYear(), etNow.getUTCMonth() + 1, 0)).getUTCDate();

        const { count } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .gte('appointment_date', monthStart.toISOString())
          .lt('appointment_date', monthEnd.toISOString())
          .in('status', ['scheduled', 'confirmed', 'specimen_delivered', 'completed'])
          .in('payment_status', ['completed', 'paid', 'org_billed', 'not_required']);

        setVisitsMtd(count || 0);
        setDaysElapsed(dayOfMonth);
        setDaysInMonth(totalDays);
      } catch (e) {
        console.warn('[break-even] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const grossProfit = visitsMtd * PER_VISIT_GROSS_PROFIT;
  const phlebPay = visitsMtd * PER_VISIT_PHLEB_PAY;
  const projection = Math.round((visitsMtd / Math.max(daysElapsed, 1)) * daysInMonth);

  let status: 'red' | 'yellow' | 'green';
  let statusIcon = AlertTriangle;
  let statusColor = 'red';
  let statusLine = '';

  if (visitsMtd >= PERSONAL_GOAL_VISITS) {
    status = 'green';
    statusIcon = Trophy;
    statusColor = 'emerald';
    statusLine = `🎯 Goal hit — every visit from here is pure upside. Pace: ${projection}/mo.`;
  } else if (visitsMtd >= FIXED_BREAKEVEN_VISITS) {
    status = 'yellow';
    statusIcon = Target;
    statusColor = 'amber';
    statusLine = `In the green · ${PERSONAL_GOAL_VISITS - visitsMtd} more visits to hit $5K personal goal · pace: ${projection}/mo`;
  } else {
    status = 'red';
    statusIcon = AlertTriangle;
    statusColor = 'red';
    statusLine = `${FIXED_BREAKEVEN_VISITS - visitsMtd} visits to cover this month's fixed costs · pace: ${projection}/mo`;
  }

  const Icon = statusIcon;
  const progressToBreakEven = Math.min(100, (visitsMtd / FIXED_BREAKEVEN_VISITS) * 100);
  const progressToGoal = Math.min(100, (visitsMtd / PERSONAL_GOAL_VISITS) * 100);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading break-even tracker…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`shadow-sm border-l-4 ${
      status === 'green' ? 'border-l-emerald-500'
      : status === 'yellow' ? 'border-l-amber-500'
      : 'border-l-red-500'
    }`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center ${
              status === 'green' ? 'bg-emerald-100 text-emerald-700'
              : status === 'yellow' ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'
            }`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Break-even Tracker</p>
              <h3 className="text-lg font-bold text-gray-900">
                {visitsMtd} visit{visitsMtd === 1 ? '' : 's'} this month
              </h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Day {daysElapsed} / {daysInMonth}</p>
            <p className="text-xs text-gray-700 font-semibold">
              ${phlebPay.toLocaleString(undefined, { maximumFractionDigits: 0 })} earned
            </p>
          </div>
        </div>

        <p className={`text-sm mt-3 ${
          status === 'green' ? 'text-emerald-800'
          : status === 'yellow' ? 'text-amber-800'
          : 'text-red-800'
        }`}>
          {statusLine}
        </p>

        {/* Two-track progress: cover-fixed-costs vs. hit-personal-goal */}
        <div className="mt-4 space-y-2.5">
          <div>
            <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
              <span>1. Cover fixed costs ({FIXED_BREAKEVEN_VISITS} visits)</span>
              <span className="font-semibold">{Math.min(visitsMtd, FIXED_BREAKEVEN_VISITS)} / {FIXED_BREAKEVEN_VISITS}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${visitsMtd >= FIXED_BREAKEVEN_VISITS ? 'bg-emerald-500' : 'bg-red-400'}`}
                style={{ width: `${progressToBreakEven}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
              <span>2. $5K personal goal ({PERSONAL_GOAL_VISITS} visits)</span>
              <span className="font-semibold">{visitsMtd} / {PERSONAL_GOAL_VISITS}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full transition-all ${visitsMtd >= PERSONAL_GOAL_VISITS ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${progressToGoal}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
          <span>Gross profit MTD: <strong className="text-gray-700">${grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Projected: {projection} visits
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

export default BreakEvenTracker;
