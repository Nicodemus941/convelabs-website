import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, TrendingUp } from 'lucide-react';

/**
 * P5 — Member LTV / savings banner.
 *
 * Hormozi retention logic: people don't renew because your feature list is
 * good, they renew because they see the money they already SAVED as a
 * sunk cost of leaving. So we show it, prominently, on every visit to the
 * dashboard. The number compounds across the year; the trophy frames it as
 * status, not discount.
 *
 * Shown only to users with an active membership AND at least one completed
 * visit. No membership → no banner (we don't want to nag non-members here;
 * that job belongs to the membership upsell card below).
 */

interface SavingsData {
  total_visits: number;
  total_saved_cents: number;
  ytd_visits: number;
  ytd_saved_cents: number;
  member_since: string | null;
  tier: 'regular_member' | 'vip' | 'concierge' | null;
}

const TIER_META: Record<string, { label: string; bg: string; text: string; border: string; accent: string }> = {
  regular_member: { label: 'Member', bg: 'bg-amber-50', text: 'text-amber-900', border: 'border-amber-300', accent: 'text-amber-600' },
  vip: { label: 'VIP', bg: 'bg-red-50', text: 'text-red-900', border: 'border-red-300', accent: 'text-red-600' },
  concierge: { label: 'Concierge', bg: 'bg-purple-50', text: 'text-purple-900', border: 'border-purple-300', accent: 'text-purple-600' },
};

const MemberSavingsBanner: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<SavingsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const { data: result, error } = await supabase.rpc('get_member_savings', { p_user_id: user.id });
        if (error) throw error;
        setData(result as SavingsData);
      } catch {
        // Fail silently — banner just doesn't render. Dashboard still works.
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  if (loading || !data) return null;
  if (!data.tier) return null;                // not a member
  if (data.total_visits === 0) return null;   // no visits yet — no savings story to tell

  const meta = TIER_META[data.tier] || TIER_META.regular_member;
  const ytdSaved = Math.round((data.ytd_saved_cents || 0) / 100);
  const totalSaved = Math.round((data.total_saved_cents || 0) / 100);
  const memberSinceDate = data.member_since ? new Date(data.member_since) : null;
  const memberSinceLabel = memberSinceDate
    ? memberSinceDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  return (
    <div className={`relative overflow-hidden rounded-xl border ${meta.bg} ${meta.border} p-5 mb-6`}>
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center ${meta.accent}`}>
          <Trophy className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs uppercase tracking-wider font-semibold ${meta.accent}`}>
            {meta.label} · Member {memberSinceLabel && `since ${memberSinceLabel}`}
          </p>
          <h3 className={`text-2xl sm:text-3xl font-bold mt-1 ${meta.text}`}>
            You've saved <span className={meta.accent}>${totalSaved.toLocaleString()}</span>
          </h3>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <div className={meta.text}>
              <span className="opacity-70">This year:</span>{' '}
              <strong>${ytdSaved.toLocaleString()}</strong>
              {data.ytd_visits > 0 && (
                <span className="opacity-70"> · {data.ytd_visits} visit{data.ytd_visits === 1 ? '' : 's'}</span>
              )}
            </div>
            <div className={meta.text}>
              <span className="opacity-70">Lifetime:</span>{' '}
              <strong>{data.total_visits} visit{data.total_visits === 1 ? '' : 's'}</strong>
            </div>
          </div>
          {ytdSaved > 0 && (
            <p className={`mt-3 text-xs ${meta.text} opacity-80 flex items-center gap-1`}>
              <TrendingUp className="h-3 w-3" />
              Your {meta.label.toLowerCase()} perks paid for themselves {ytdSaved >= 199 ? 'and then some' : 'already'} this year.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberSavingsBanner;
