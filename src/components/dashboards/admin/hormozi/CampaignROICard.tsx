import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, TrendingUp, UserX, CreditCard, Calendar, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

/**
 * CampaignROICard — monitors the ROI of a specific email campaign
 * from campaign_sends + email_unsubscribes + user_memberships +
 * appointments. Fires a single RPC (public.campaign_roi) that
 * aggregates all signals in one round-trip.
 *
 * Shown at the top of the Hormozi Dashboard for the 2-4 hours after
 * a live campaign so the owner can watch bookings / memberships /
 * unsubscribes roll in.
 */

interface ROIStats {
  campaign_key: string;
  fired_at: string | null;
  sent: number;
  failed: number;
  unsubscribed: number;
  recipient_count_matched_to_patients: number;
  memberships_since_fire: number;
  bookings_since_fire: number;
}

// Which campaign to track. Update the key when we fire new campaigns.
const CAMPAIGN_KEY = 'patient_announce_2026_04_19';
const CAMPAIGN_LABEL = 'Patient portal launch blast';

// Per-tier annual MRR (rough — used for quick "MRR added" math)
const ANNUAL_BY_TIER: Record<string, number> = {
  member: 99,
  vip: 199,
  concierge: 399,
};

const fmtMoney = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const fmtTimeAgo = (iso: string | null): string => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const CampaignROICard: React.FC = () => {
  const [stats, setStats] = useState<ROIStats | null>(null);
  const [membershipsMRR, setMembershipsMRR] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // Main aggregate RPC
    const { data, error } = await supabase.rpc('campaign_roi' as any, { p_campaign_key: CAMPAIGN_KEY });
    if (error) {
      console.warn('[CampaignROICard] rpc error:', error);
      setLoading(false);
      return;
    }
    const s = data as ROIStats;
    setStats(s);

    // MRR — pull the new memberships and sum their tier annual prices.
    // Best-effort; if user_memberships doesn't expose tier on the row
    // itself, we fall back to membership_plans lookup.
    if (s?.fired_at && s?.memberships_since_fire > 0) {
      try {
        const { data: mems } = await supabase
          .from('user_memberships' as any)
          .select('id, status, membership_plan_id, created_at, membership_plans(tier, annual_price_cents)')
          .gte('created_at', s.fired_at)
          .in('status', ['active', 'trialing']);
        let total = 0;
        for (const m of ((mems as any[]) || [])) {
          const plan = (m as any).membership_plans;
          const tier = String(plan?.tier || '').toLowerCase();
          if (plan?.annual_price_cents) {
            total += plan.annual_price_cents / 100;
          } else if (ANNUAL_BY_TIER[tier]) {
            total += ANNUAL_BY_TIER[tier];
          }
        }
        setMembershipsMRR(total);
      } catch (e) {
        // Non-blocking — show memberships count without MRR if lookup fails
        console.warn('[CampaignROICard] MRR lookup failed:', e);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Poll every 60s for the first few hours — cheap and lively
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || !stats.fired_at || stats.sent === 0) {
    // No campaign fired yet — hide the card entirely
    return null;
  }

  const unsubRate = stats.sent > 0 ? (stats.unsubscribed / stats.sent) * 100 : 0;
  const convRate = stats.sent > 0 ? ((stats.memberships_since_fire + stats.bookings_since_fire) / stats.sent) * 100 : 0;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-600" />
          Campaign ROI · <span className="font-normal text-gray-600">{CAMPAIGN_LABEL}</span>
          <span className="ml-auto text-[11px] font-normal text-gray-500">
            Fired {fmtTimeAgo(stats.fired_at)} · auto-refreshes every 60s
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Sends */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <Mail className="h-3 w-3" /> Delivered
            </div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{stats.sent.toLocaleString()}</div>
            <div className="text-[11px] text-gray-500">
              {stats.failed > 0 ? `${stats.failed} failed` : 'All through Mailgun'}
            </div>
          </div>

          {/* Unsubscribes */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              <UserX className="h-3 w-3" /> Unsubscribed
            </div>
            <div className={`text-2xl font-bold mt-1 ${unsubRate > 2 ? 'text-amber-600' : 'text-gray-900'}`}>
              {stats.unsubscribed}
            </div>
            <div className="text-[11px] text-gray-500">
              {unsubRate.toFixed(2)}% {unsubRate > 2 ? '· watch copy' : '· healthy'}
            </div>
          </div>

          {/* Memberships */}
          <div className="bg-white border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">
              <CreditCard className="h-3 w-3" /> Memberships
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{stats.memberships_since_fire}</div>
            <div className="text-[11px] text-emerald-600">
              {membershipsMRR > 0 ? `${fmtMoney(membershipsMRR)} added` : 'Since fire'}
            </div>
          </div>

          {/* Bookings */}
          <div className="bg-white border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-700 uppercase tracking-wider">
              <Calendar className="h-3 w-3" /> New Bookings
            </div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{stats.bookings_since_fire}</div>
            <div className="text-[11px] text-blue-600">Since fire</div>
          </div>

          {/* Conversion rate */}
          <div className="bg-white border border-conve-red/30 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-conve-red uppercase tracking-wider">
              <TrendingUp className="h-3 w-3" /> Conv. Rate
            </div>
            <div className="text-2xl font-bold text-conve-red mt-1">{convRate.toFixed(1)}%</div>
            <div className="text-[11px] text-gray-500">
              Memberships + bookings
            </div>
          </div>
        </div>

        <p className="text-[10px] text-gray-400 italic mt-3">
          Conversions = user_memberships + appointments created at/after fire time whose user/email matches a campaign recipient.
          MRR estimate uses member plans' annual_price_cents divided appropriately.
        </p>
      </CardContent>
    </Card>
  );
};

export default CampaignROICard;
