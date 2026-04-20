import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageCircle, TrendingUp, AlertTriangle, DollarSign, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * ChatROICard — Hormozi Dashboard tile summarizing Ask-Nico bot performance.
 *
 * Read-only summary pulled from get_chatbot_stats(30). Primary job:
 * show the chat→booking funnel + 30-day cost at a glance, and
 * highlight if escalations are spiking. Click-through to the full
 * ChatbotTab for drill-down.
 *
 * Auto-hides when the bot hasn't had any conversations yet (don't
 * clutter the dashboard with zeros).
 */

interface Stats {
  window_days: number;
  total_conversations: number;
  today_conversations: number;
  qualified: number;
  captured_contact: number;
  booked: number;
  escalated: number;
  stumped: number;
  avg_messages_per_conv: number;
  estimated_cost_usd: number;
}

const ChatROICard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const basePath = `/dashboard/${user?.role || 'super_admin'}`;

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.rpc('get_chatbot_stats' as any, { p_days: 30 });
      if (mounted) {
        setStats(data as any);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  // Hide tile entirely if nothing happened — avoids zero-noise on the dashboard
  if (!stats || stats.total_conversations === 0) {
    return null;
  }

  // Funnel conversion rates
  const qualifiedPct = stats.total_conversations > 0
    ? Math.round((stats.qualified / stats.total_conversations) * 100)
    : 0;
  const bookedPct = stats.total_conversations > 0
    ? Math.round((stats.booked / stats.total_conversations) * 100)
    : 0;
  const escalatedPct = stats.total_conversations > 0
    ? Math.round((stats.escalated / stats.total_conversations) * 100)
    : 0;

  const escalationsHot = escalatedPct > 10; // > 10% is a signal to investigate
  const healthy = qualifiedPct >= 40 && escalationsHot === false;

  return (
    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-indigo-600" />
          Ask Nico Chatbot · <span className="font-normal text-gray-600">30-day snapshot</span>
          <Link to={`${basePath}/chatbot`} className="ml-auto text-xs text-indigo-700 hover:underline inline-flex items-center gap-0.5">
            Full view <ArrowRight className="h-3 w-3" />
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Tile label="Total chats" value={stats.total_conversations} detail={`${stats.today_conversations} today`} />
          <Tile label="Qualified" value={stats.qualified} detail={`${qualifiedPct}% rate`} emphasize={qualifiedPct >= 40} />
          <Tile label="Bookings" value={stats.booked} detail={`${bookedPct}% conv.`} emphasize={stats.booked > 0} />
          <Tile
            label="Escalated"
            value={stats.escalated}
            detail={`${escalatedPct}%`}
            alert={escalationsHot}
          />
          <Tile label="30-day cost" value={`$${stats.estimated_cost_usd.toFixed(2)}`} detail={`${stats.avg_messages_per_conv} msg/avg`} />
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs">
          {healthy && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <TrendingUp className="h-3 w-3" /> Healthy — bot is qualifying well
            </span>
          )}
          {escalationsHot && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <AlertTriangle className="h-3 w-3" /> Escalation rate above 10% — investigate
            </span>
          )}
          {stats.stumped > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-700 ml-auto">
              {stats.stumped} stumped — review Frequent Questions
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const Tile: React.FC<{ label: string; value: number | string; detail?: string; emphasize?: boolean; alert?: boolean }> = ({ label, value, detail, emphasize, alert }) => (
  <div className={`rounded-lg p-3 border ${
    alert ? 'bg-red-50 border-red-200' :
    emphasize ? 'bg-emerald-50 border-emerald-200' :
    'bg-white border-gray-200'
  }`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
    <div className={`text-xl font-bold mt-0.5 ${
      alert ? 'text-red-700' : emphasize ? 'text-emerald-700' : 'text-gray-900'
    }`}>{value}</div>
    {detail && <div className="text-[11px] text-gray-500 mt-0.5">{detail}</div>}
  </div>
);

export default ChatROICard;
