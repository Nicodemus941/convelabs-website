/**
 * CampaignEngagementCard
 *
 * Auto-detects the most recent broadcast campaign (via list_campaigns RPC)
 * and surfaces live engagement metrics: sent / opened / clicked / bounced
 * + open & click rates. Refreshes every 60s while the page is open.
 *
 * Wired to the Hormozi Dashboard. Data flow:
 *   campaign_sends + mailgun-webhook → get_campaign_engagement RPC → here
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, MousePointerClick, Eye, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Engagement {
  campaign_key: string;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  complained: number;
  open_rate_pct: number;
  click_rate_pct: number;
  bounce_rate_pct: number;
  first_sent_at: string | null;
  last_sent_at: string | null;
}

interface CampaignRow {
  campaign_key: string;
  sent: number;
  last_sent_at: string;
}

const CAMPAIGN_LABELS: Record<string, string> = {
  patient_feature_update_2026_04_25: 'New ConveLabs Hours announcement',
  patient_announce_2026_04_19: 'Patient portal launch blast',
};

function fmtTimeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CampaignEngagementCard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stats, setStats] = useState<Engagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load all campaigns once on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('list_campaigns' as any);
      if (cancelled) return;
      if (error) { console.warn('[CampaignEngagement] list_campaigns:', error); setLoading(false); return; }
      const rows = (data as CampaignRow[]) || [];
      setCampaigns(rows);
      if (rows.length > 0) setSelectedKey(rows[0].campaign_key);
      else setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch engagement whenever the selected key changes; also poll every 60s.
  useEffect(() => {
    if (!selectedKey) return;
    let cancelled = false;
    const fetchOnce = async () => {
      setRefreshing(true);
      try {
        const { data, error } = await supabase.rpc('get_campaign_engagement' as any, { p_campaign_key: selectedKey });
        if (cancelled) return;
        if (!error && data) setStats(data as Engagement);
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    };
    fetchOnce();
    const t = setInterval(fetchOnce, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [selectedKey]);

  const friendlyLabel = useMemo(() => {
    if (!selectedKey) return '';
    return CAMPAIGN_LABELS[selectedKey] || selectedKey;
  }, [selectedKey]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-conve-red mr-2" />
          <span className="text-sm text-muted-foreground">Loading campaign engagement…</span>
        </CardContent>
      </Card>
    );
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Campaign engagement</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">No broadcast campaigns yet.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <Mail className="h-4 w-4 text-conve-red flex-shrink-0" />
              Campaign engagement
              {refreshing && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
            </CardTitle>
            <p className="text-[11px] text-gray-500 mt-1 truncate">
              Last fired {stats?.last_sent_at ? fmtTimeAgo(stats.last_sent_at) : '—'} · auto-refreshing every 60s
            </p>
          </div>
          {/* Campaign picker — defaults to most recent */}
          {campaigns.length > 1 && (
            <select
              value={selectedKey || ''}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="text-xs border border-gray-300 rounded-md px-2 py-1.5 bg-white max-w-full"
            >
              {campaigns.map(c => (
                <option key={c.campaign_key} value={c.campaign_key}>
                  {(CAMPAIGN_LABELS[c.campaign_key] || c.campaign_key).slice(0, 50)} · {c.sent}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-sm font-semibold text-gray-900 mt-2">{friendlyLabel}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* Top-line metrics — 4-up grid on mobile and desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Sent" value={stats?.sent ?? 0} icon={<Mail className="h-3.5 w-3.5" />} color="gray" />
          <Metric label="Opened" value={stats?.opened ?? 0} pct={stats?.open_rate_pct} icon={<Eye className="h-3.5 w-3.5" />} color="emerald" />
          <Metric label="Clicked" value={stats?.clicked ?? 0} pct={stats?.click_rate_pct} icon={<MousePointerClick className="h-3.5 w-3.5" />} color="blue" />
          <Metric label="Bounced" value={stats?.bounced ?? 0} pct={stats?.bounce_rate_pct} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="amber" />
        </div>

        {/* Engagement rate progress bars — visual cue */}
        <div className="space-y-2 pt-1">
          <RateBar label="Open rate" pct={stats?.open_rate_pct || 0} color="emerald" benchmark={20} benchmarkLabel="industry avg ~20%" />
          <RateBar label="Click rate" pct={stats?.click_rate_pct || 0} color="blue" benchmark={2.5} benchmarkLabel="industry avg ~2.5%" />
        </div>

        {/* Raw counts row — secondary signals */}
        {(stats?.failed || stats?.complained) ? (
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-gray-500">
            {stats?.failed ? <span><strong className="text-gray-700">{stats.failed}</strong> failed</span> : null}
            {stats?.complained ? <span><strong className="text-gray-700">{stats.complained}</strong> spam-complained</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

const Metric: React.FC<{ label: string; value: number; pct?: number; icon: React.ReactNode; color: 'gray' | 'emerald' | 'blue' | 'amber' }> = ({ label, value, pct, icon, color }) => {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
  };
  return (
    <div className={`border rounded-lg px-3 py-2.5 ${colorMap[color]}`}>
      <div className="flex items-center gap-1 text-[11px] font-medium opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg sm:text-xl font-bold leading-tight mt-0.5">{value.toLocaleString()}</p>
      {typeof pct === 'number' && pct > 0 && (
        <p className="text-[11px] opacity-75 leading-none">{pct.toFixed(1)}%</p>
      )}
    </div>
  );
};

const RateBar: React.FC<{ label: string; pct: number; color: 'emerald' | 'blue'; benchmark: number; benchmarkLabel: string }> = ({ label, pct, color, benchmark, benchmarkLabel }) => {
  const fillColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500';
  const goodVsBenchmark = pct >= benchmark;
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className={`font-semibold ${goodVsBenchmark ? 'text-emerald-700' : 'text-gray-600'}`}>
          {pct.toFixed(1)}% {goodVsBenchmark ? '✓' : ''}
        </span>
      </div>
      <div className="relative h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`absolute top-0 left-0 h-full ${fillColor} transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }} />
        {/* Benchmark tick */}
        <div className="absolute top-0 h-full w-px bg-gray-400/60" style={{ left: `${Math.min(100, benchmark)}%` }} />
      </div>
      <p className="text-[10px] text-gray-400 mt-1">Tick = {benchmarkLabel}</p>
    </div>
  );
};

export default CampaignEngagementCard;
