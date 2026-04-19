import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, DollarSign, Users, Plus } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

/**
 * H2 — CAC per channel.
 *
 * Pulls `get_cac_by_channel(month)` RPC which joins ad_spend_log with
 * UTM-attributed tenant_patients + appointments for that month. Shows
 * CAC per channel and lets the owner log ad spend inline.
 *
 * Drives the Level 0 "CAC documented per channel" gate. Also the
 * foundation for the future Sell-path cohort LTV work.
 */

interface ChannelRow {
  channel: string;
  period_month: string;
  spend_cents: number;
  new_patients: number;
  appointments_booked: number;
  revenue_cents: number;
  cac_cents: number | null;
  ltv_90d_cents: number | null;
}

const firstOfThisMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().substring(0, 10);
};

const formatMonthLabel = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const AcquisitionByChannel: React.FC = () => {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [month, setMonth] = useState(firstOfThisMonth());
  const [loading, setLoading] = useState(true);
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendChannel, setSpendChannel] = useState('');
  const [spendAmount, setSpendAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_cac_by_channel', { p_month: month });
      if (error) throw error;
      setRows((data as ChannelRow[]) || []);
    } catch (e) {
      console.error('[AcquisitionByChannel] load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month]);

  const saveSpend = async () => {
    const cents = Math.round(parseFloat(spendAmount) * 100);
    if (!spendChannel.trim() || !cents || cents < 0) {
      toast.error('Enter a channel name and a non-negative dollar amount');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ad_spend_log')
        .upsert(
          {
            channel: spendChannel.trim().toLowerCase().replace(/\s+/g, '_'),
            period_month: month,
            spend_cents: cents,
          },
          { onConflict: 'channel,period_month' }
        );
      if (error) throw error;
      toast.success(`Logged $${(cents / 100).toFixed(2)} for ${spendChannel}`);
      setSpendOpen(false);
      setSpendChannel('');
      setSpendAmount('');
      load();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const totalSpend = rows.reduce((s, r) => s + (r.spend_cents || 0), 0) / 100;
  const totalNew = rows.reduce((s, r) => s + (r.new_patients || 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue_cents || 0), 0) / 100;
  const blendedCAC = totalNew > 0 ? totalSpend / totalNew : null;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#B91C1C]" />
            Acquisition by Channel
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">{formatMonthLabel(month)} · CAC per source</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSpendOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Log ad spend
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Month picker */}
        <div className="px-5 pb-3 flex items-center gap-2">
          <label className="text-xs text-gray-600">Period:</label>
          <input
            type="month"
            value={month.substring(0, 7)}
            onChange={e => setMonth(`${e.target.value}-01`)}
            className="text-xs border rounded px-2 py-1"
          />
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-px bg-gray-100 border-y">
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Ad spend</p>
            <p className="text-sm font-bold mt-0.5">${totalSpend.toFixed(0)}</p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">New patients</p>
            <p className="text-sm font-bold mt-0.5">{totalNew}</p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Revenue</p>
            <p className="text-sm font-bold mt-0.5">${totalRevenue.toFixed(0)}</p>
          </div>
          <div className="bg-white p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Blended CAC</p>
            <p className={`text-sm font-bold mt-0.5 ${blendedCAC && blendedCAC < 30 ? 'text-emerald-600' : blendedCAC ? 'text-amber-600' : 'text-gray-400'}`}>
              {blendedCAC !== null ? `$${blendedCAC.toFixed(0)}` : '—'}
            </p>
          </div>
        </div>

        {/* Per-channel table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-5 py-2 text-left font-semibold">Channel</th>
                <th className="px-3 py-2 text-right font-semibold">Spend</th>
                <th className="px-3 py-2 text-right font-semibold">New pt</th>
                <th className="px-3 py-2 text-right font-semibold">Bookings</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                <th className="px-5 py-2 text-right font-semibold">CAC</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                    No attribution data yet for this month.
                    <br />
                    <span className="text-[11px]">Link your ads with <code className="bg-gray-100 px-1">?utm_source=google_ads</code> and log spend above.</span>
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const cac = r.cac_cents !== null ? r.cac_cents / 100 : null;
                  const cacColor = cac === null ? 'text-gray-400' : cac < 30 ? 'text-emerald-600' : cac < 60 ? 'text-amber-600' : 'text-red-600';
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-5 py-2 font-medium">{r.channel}</td>
                      <td className="px-3 py-2 text-right">${(r.spend_cents / 100).toFixed(0)}</td>
                      <td className="px-3 py-2 text-right">{r.new_patients}</td>
                      <td className="px-3 py-2 text-right">{r.appointments_booked}</td>
                      <td className="px-3 py-2 text-right">${(r.revenue_cents / 100).toFixed(0)}</td>
                      <td className={`px-5 py-2 text-right font-semibold ${cacColor}`}>
                        {cac !== null ? `$${cac.toFixed(0)}` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="px-5 py-2 text-[10px] text-gray-400 border-t">
          Target: CAC &lt; $30 at $15K MRR. Direct = untagged organic/word-of-mouth. Log every paid channel's spend monthly to make CAC real.
        </p>
      </CardContent>

      {/* Ad-spend entry dialog */}
      <Dialog open={spendOpen} onOpenChange={setSpendOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Ad Spend — {formatMonthLabel(month)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-gray-600">Channel</label>
              <Input
                placeholder="e.g. google_ads, facebook, instagram, billboard"
                value={spendChannel}
                onChange={e => setSpendChannel(e.target.value)}
              />
              <p className="text-[10px] text-gray-500 mt-1">Match the utm_source value on your tracking links — e.g. if your ads use <code>utm_source=google_ads</code>, enter <code>google_ads</code>.</p>
            </div>
            <div>
              <label className="text-xs text-gray-600">Spend this month ($)</label>
              <Input type="number" step="0.01" placeholder="0.00" value={spendAmount} onChange={e => setSpendAmount(e.target.value)} />
            </div>
            <Button onClick={saveSpend} disabled={saving} className="w-full bg-[#B91C1C] hover:bg-[#991B1B]">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AcquisitionByChannel;
