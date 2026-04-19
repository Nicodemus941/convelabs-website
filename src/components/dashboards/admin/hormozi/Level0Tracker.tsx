import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Circle, Target, Star, Repeat, BookOpen, Trophy, Loader2 } from 'lucide-react';

/**
 * H1 — Level 0 Unlock Progress.
 *
 * Master plan Part B defines Level 0 as:
 *   - 30 visits/mo with owner + assistant only
 *   - Written SOPs for 6 workflows
 *   - 90-day repeat rate ≥ 30%
 *   - 4.8+ Google rating (50+ reviews)
 *   - CAC documented per channel (covered by AcquisitionByChannel widget)
 *
 * This component renders the first 4. When all ✅ for 2 consecutive months,
 * a "Level 1 unlocked" banner appears — signal to hire the first 1099 phleb.
 *
 * Hormozi principle: "what gets measured gets moved." Putting the gate
 * on the owner's opening screen keeps them on-target without nagging.
 */

interface Level0Data {
  visits: { mtd: number; last_month: number; target: number; met: boolean };
  google_rating: { current: number; review_count: number; rating_target: number; review_count_target: number; met: boolean };
  repeat_rate: { current_pct: number; target_pct: number; met: boolean };
  sop_coverage: { published: number; total: number; target: number; met: boolean };
}

const MetricRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  current: string;
  target: string;
  met: boolean;
  progress: number; // 0-1
}> = ({ icon: Icon, label, current, target, met, progress }) => (
  <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg border bg-white">
    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${met ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      {met ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className={`text-xs font-medium ${met ? 'text-emerald-600' : 'text-gray-500'}`}>
          {current} <span className="text-gray-400">/ {target}</span>
        </p>
      </div>
      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${met ? 'bg-emerald-500' : 'bg-[#B91C1C]'}`}
          style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      </div>
    </div>
  </div>
);

const Level0Tracker: React.FC = () => {
  const [data, setData] = useState<Level0Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: res, error } = await supabase.rpc('get_level0_progress');
        if (error) throw error;
        setData(res as Level0Data);
      } catch (e) {
        console.error('[Level0Tracker] load failed:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const metricsMetCount = [
    data.visits.met,
    data.google_rating.met,
    data.repeat_rate.met,
    data.sop_coverage.met,
  ].filter(Boolean).length;

  const allMet = metricsMetCount === 4;
  const twoMonthsStrong = allMet && data.visits.last_month >= data.visits.target;

  return (
    <Card className={`shadow-sm ${allMet ? 'border-emerald-300 bg-emerald-50/30' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Trophy className={`h-4 w-4 ${allMet ? 'text-emerald-600' : 'text-[#B91C1C]'}`} />
              Level 0 — Prove the Model
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {metricsMetCount} of 4 gates cleared{allMet ? ' ✓' : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full ${i < metricsMetCount ? 'bg-emerald-500' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <MetricRow
            icon={Target}
            label="Visits this month"
            current={String(data.visits.mtd)}
            target={String(data.visits.target)}
            met={data.visits.met}
            progress={data.visits.mtd / data.visits.target}
          />
          <MetricRow
            icon={Star}
            label="Google rating + reviews"
            current={
              data.google_rating.current > 0
                ? `${data.google_rating.current.toFixed(1)}★ × ${data.google_rating.review_count}`
                : 'not tracked'
            }
            target={`${data.google_rating.rating_target}★ × ${data.google_rating.review_count_target}`}
            met={data.google_rating.met}
            progress={
              Math.min(
                data.google_rating.current / data.google_rating.rating_target,
                data.google_rating.review_count / data.google_rating.review_count_target
              )
            }
          />
          <MetricRow
            icon={Repeat}
            label="90-day repeat rate"
            current={`${data.repeat_rate.current_pct.toFixed(0)}%`}
            target={`${data.repeat_rate.target_pct}%`}
            met={data.repeat_rate.met}
            progress={data.repeat_rate.current_pct / data.repeat_rate.target_pct}
          />
          <MetricRow
            icon={BookOpen}
            label="SOPs published"
            current={`${data.sop_coverage.published}`}
            target={`${data.sop_coverage.target}`}
            met={data.sop_coverage.met}
            progress={data.sop_coverage.published / data.sop_coverage.target}
          />
        </div>

        {twoMonthsStrong ? (
          <div className="mt-4 bg-emerald-600 text-white rounded-lg p-3 text-center text-sm font-semibold">
            🎉 Level 1 unlocked — ready to post the 1099 phleb listing (per master plan Part A2).
          </div>
        ) : allMet ? (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg p-3 text-xs">
            All 4 gates cleared this month. Hit {data.visits.target}+ visits next month too to graduate to Level 1.
          </div>
        ) : (
          <p className="mt-4 text-[11px] text-gray-500">
            Graduate to Level 1 (hire first 1099 phleb) after ALL 4 ✅ for 2 consecutive months.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default Level0Tracker;
