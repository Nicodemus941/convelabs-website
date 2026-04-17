import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import {
  Crown, Users, Tag, Package, TrendingUp, DollarSign,
  MessageSquare, Phone, Loader2, ArrowRight,
} from 'lucide-react';

/**
 * UPGRADES & ROI DASHBOARD
 *
 * One pane of glass for every revenue-adjacent upgrade event:
 *   - companion_click      (Text-to-Add family-member upsell taps)
 *   - membership_applied   (bookings where a member discount fired)
 *   - promo_applied        (bookings where a referral/promo code fired)
 *   - bundle_purchased     (multi-visit bundles — reserved for when wired)
 *
 * Two-level view:
 *   1. Top KPI tiles: total potential $, realized $, discount $, conversion %
 *   2. Per-type breakdown + recent event feed
 *
 * Hormozi: "What gets measured, gets managed. What gets posted on the wall,
 * gets improved."
 */

type EventType = 'companion_click' | 'membership_applied' | 'promo_applied' | 'bundle_purchased';

interface UpgradeEvent {
  id: string;
  event_type: EventType | string;
  status: 'intent' | 'converted' | 'lost' | string;
  patient_email: string | null;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_id: string | null;
  revenue_cents: number;
  potential_cents: number;
  discount_cents: number;
  metadata: Record<string, any>;
  created_at: string;
  converted_at: string | null;
}

const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  companion_click:     { label: 'Family Member Add-ons', icon: Users,   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  membership_applied:  { label: 'Membership Discounts',  icon: Crown,   color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  promo_applied:       { label: 'Promo / Referral Codes', icon: Tag,    color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  bundle_purchased:    { label: 'Visit Bundles',          icon: Package, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
};

const RANGES = [
  { key: '7d',  label: 'Last 7 days',  days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time',     days: 9999 },
] as const;

const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toFixed(2)}`;

const UpgradesTab: React.FC = () => {
  const [events, setEvents] = useState<UpgradeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<typeof RANGES[number]['key']>('30d');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const cutoff = new Date(Date.now() - (RANGES.find(r => r.key === range)?.days ?? 30) * 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from('upgrade_events' as any)
        .select('*')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(500);
      setEvents((data as unknown as UpgradeEvent[]) || []);
      setLoading(false);
    })();
  }, [range]);

  const kpis = useMemo(() => {
    const byType: Record<string, { intent: number; converted: number; revenue: number; discount: number; potential: number }> = {};
    let totalRevenue = 0, totalPotential = 0, totalDiscount = 0, intent = 0, converted = 0;
    for (const e of events) {
      const t = e.event_type;
      if (!byType[t]) byType[t] = { intent: 0, converted: 0, revenue: 0, discount: 0, potential: 0 };
      if (e.status === 'converted') { byType[t].converted++; converted++; }
      else { byType[t].intent++; intent++; }
      byType[t].revenue += e.revenue_cents || 0;
      byType[t].discount += e.discount_cents || 0;
      byType[t].potential += e.potential_cents || 0;
      totalRevenue += e.revenue_cents || 0;
      totalPotential += e.potential_cents || 0;
      totalDiscount += e.discount_cents || 0;
    }
    const conversionRate = (intent + converted) > 0 ? (converted / (intent + converted)) * 100 : 0;
    return { byType, totalRevenue, totalPotential, totalDiscount, intent, converted, conversionRate };
  }, [events]);

  const recent = events.slice(0, 25);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Crown className="h-5 w-5 text-emerald-600" /> Upgrades &amp; ROI
          </h1>
          <p className="text-sm text-muted-foreground">
            Every upsell, discount, and membership perk that touched a booking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${range === r.key ? 'bg-[#1e293b] text-white border-[#1e293b]' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  <DollarSign className="h-3.5 w-3.5" /> Realized Revenue
                </div>
                <p className="text-2xl font-bold text-emerald-700">{dollars(kpis.totalRevenue)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpis.converted} converted booking(s)</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Pipeline Potential
                </div>
                <p className="text-2xl font-bold text-blue-700">{dollars(kpis.totalPotential)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{kpis.intent} open intent event(s)</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  <Tag className="h-3.5 w-3.5" /> Discounts Given
                </div>
                <p className="text-2xl font-bold text-purple-700">{dollars(kpis.totalDiscount)}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Member perks + promo codes</p>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  <ArrowRight className="h-3.5 w-3.5" /> Conversion
                </div>
                <p className="text-2xl font-bold text-gray-900">{kpis.conversionRate.toFixed(1)}%</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Intent → converted</p>
              </CardContent>
            </Card>
          </div>

          {/* Per-type breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(TYPE_META).map(([key, meta]) => {
              const k = kpis.byType[key] || { intent: 0, converted: 0, revenue: 0, discount: 0, potential: 0 };
              const total = k.intent + k.converted;
              const Icon = meta.icon;
              const convRate = total > 0 ? (k.converted / total) * 100 : 0;
              return (
                <Card key={key} className={`shadow-sm border ${meta.bg}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                        <p className={`text-sm font-semibold ${meta.color}`}>{meta.label}</p>
                      </div>
                      <span className="text-[11px] font-mono text-gray-500">{total} event(s)</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                      <div>
                        <p className="text-lg font-bold text-gray-900">{k.converted}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Converted</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{dollars(k.revenue)}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Revenue</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-gray-900">{convRate.toFixed(0)}%</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Conv.</p>
                      </div>
                    </div>
                    {k.discount > 0 && (
                      <p className="text-[11px] text-gray-500 mt-2 text-center">
                        {dollars(k.discount)} in discounts given
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Recent events feed */}
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-4 border-b">
                <p className="text-sm font-semibold">Recent Events</p>
                <span className="text-[11px] text-muted-foreground">Showing {recent.length} of {events.length}</span>
              </div>
              {recent.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">No events in this range yet.</p>
              ) : (
                <div className="divide-y">
                  {recent.map(e => {
                    const meta = TYPE_META[e.event_type] || { label: e.event_type, icon: TrendingUp, color: 'text-gray-700', bg: '' };
                    const Icon = meta.icon;
                    const isCompanion = e.event_type === 'companion_click';
                    return (
                      <div key={e.id} className="flex items-start gap-3 p-3 hover:bg-gray-50">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${meta.bg || 'bg-gray-100'}`}>
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {e.patient_name || e.patient_email || 'Anonymous'}
                            </p>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${e.status === 'converted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {e.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-0.5">
                            {meta.label}
                            {e.discount_cents > 0 && <span> · {dollars(e.discount_cents)} off</span>}
                            {e.revenue_cents > 0 && <span> · {dollars(e.revenue_cents)} revenue</span>}
                            {e.potential_cents > 0 && e.status !== 'converted' && <span> · {dollars(e.potential_cents)} potential</span>}
                            {e.metadata?.tier && <span> · <span className="uppercase font-semibold">{e.metadata.tier}</span></span>}
                            {e.metadata?.referral_code && <span> · <span className="font-mono">{e.metadata.referral_code}</span></span>}
                            {e.metadata?.channel && <span> · via {e.metadata.channel}</span>}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {format(new Date(e.created_at), 'MMM d, yyyy · h:mm a')}
                          </p>
                        </div>
                        {/* Quick actions for companion intents */}
                        {isCompanion && e.status === 'intent' && e.patient_phone && (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <a href={`sms:${e.patient_phone}`}>
                              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                                <MessageSquare className="h-3 w-3" /> Text
                              </Button>
                            </a>
                            <a href={`tel:${e.patient_phone}`}>
                              <Button size="sm" variant="outline" className="h-8 w-8 p-0">
                                <Phone className="h-3 w-3" />
                              </Button>
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default UpgradesTab;
