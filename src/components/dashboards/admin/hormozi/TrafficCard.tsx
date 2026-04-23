import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Users, Eye, TrendingUp, AlertCircle } from 'lucide-react';

/**
 * TRAFFIC CARD — PostHog-backed traffic summary on the Hormozi Dashboard.
 *
 * Proxies through `get-posthog-analytics` edge fn so the PostHog Personal
 * API key stays server-side. Shows yesterday / 7d / 30d unique visitors +
 * page views + sessions, plus yesterday's top pages and traffic sources.
 *
 * Graceful if PostHog secrets aren't set — shows "not configured" with
 * a one-line setup hint instead of breaking the dashboard.
 */

interface Summary {
  page_views: number;
  unique_visitors: number;
  sessions: number;
}

interface Data {
  yesterday: Summary;
  last_7_days: Summary;
  last_30_days: Summary;
  top_pages_yesterday: Array<{ path: string; views: number }>;
  top_sources_yesterday: Array<{ source: string; sessions: number }>;
  generated_at: string;
}

const TrafficCard: React.FC = () => {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: res, error: err } = await supabase.functions.invoke('get-posthog-analytics');
        if (err) throw err;
        if ((res as any)?.error === 'posthog_not_configured') {
          setNotConfigured(true);
          return;
        }
        if ((res as any)?.error) throw new Error((res as any).message || (res as any).error);
        setData(res as Data);
      } catch (e: any) {
        setError(e?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-5 animate-pulse">
        <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => <div key={i} className="h-16 bg-gray-100 rounded" />)}
        </div>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">PostHog analytics not configured</p>
            <p className="text-amber-800 mt-1 leading-relaxed">
              Add two secrets in Supabase Dashboard → <strong>Edge Functions → Secrets</strong>:
            </p>
            <ul className="mt-2 ml-4 list-disc text-amber-800 space-y-0.5 text-[13px]">
              <li><code className="bg-white px-1 rounded">POSTHOG_PERSONAL_API_KEY</code> — from app.posthog.com → Settings → Personal API Keys</li>
              <li><code className="bg-white px-1 rounded">POSTHOG_PROJECT_ID</code> — numeric id from PostHog Project Settings</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <p className="text-sm text-red-600">Analytics error: {error || 'no data'}</p>
      </div>
    );
  }

  const Stat = ({ label, value, icon: Icon }: { label: string; value: number; icon: any }) => (
    <div className="rounded-lg bg-gray-50 border p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
    </div>
  );

  const Period = ({ title, summary }: { title: string; summary: Summary }) => (
    <div>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">{title}</p>
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Visitors" value={summary.unique_visitors} icon={Users} />
        <Stat label="Page views" value={summary.page_views} icon={Eye} />
        <Stat label="Sessions" value={summary.sessions} icon={Activity} />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#B91C1C]" />
          <h3 className="font-bold text-gray-900">Website traffic</h3>
        </div>
        <a
          href="https://us.posthog.com"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-[#B91C1C] hover:underline font-medium"
        >
          PostHog dashboard →
        </a>
      </div>

      <Period title="Yesterday" summary={data.yesterday} />
      <Period title="Last 7 days" summary={data.last_7_days} />
      <Period title="Last 30 days" summary={data.last_30_days} />

      {data.top_pages_yesterday.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Top pages yesterday</p>
          <div className="space-y-1">
            {data.top_pages_yesterday.map((p) => (
              <div key={p.path} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                <span className="text-gray-800 truncate mr-3 font-mono text-[12px]">{p.path}</span>
                <span className="text-gray-900 font-semibold flex-shrink-0">{p.views.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.top_sources_yesterday.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">Top sources yesterday</p>
          <div className="flex flex-wrap gap-1.5">
            {data.top_sources_yesterday.map((s) => (
              <span key={s.source} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 px-2.5 py-1 rounded-full text-xs">
                <span className="font-medium">{s.source}</span>
                <span className="text-gray-500">· {s.sessions}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-400 text-right">
        Generated {new Date(data.generated_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} ET
      </p>
    </div>
  );
};

export default TrafficCard;
