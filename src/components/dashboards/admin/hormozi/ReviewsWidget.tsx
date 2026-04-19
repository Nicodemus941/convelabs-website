import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Star, Settings, Loader2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';

/**
 * H3 — Google review automation summary.
 *
 * Shows how many review-request asks fired in the last 30 days, how many
 * we can confirm clicked / rated. Lets admin configure the corporate
 * Google Business review URL + current rating (manual entry until we
 * wire Google Business Profile API).
 */

interface Summary {
  period_days: number;
  sent: number;
  clicked: number;
  with_rating: number;
  avg_rating_if_known: number | null;
}

const ReviewsWidget: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [googleRating, setGoogleRating] = useState('');
  const [reviewCount, setReviewCount] = useState('');
  const [reviewUrl, setReviewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [summaryRes, metricsRes] = await Promise.all([
        supabase.rpc('get_review_request_summary', { p_days: 30 }),
        supabase.from('business_metrics').select('metric_key, value_numeric, value_text').in('metric_key', ['google_rating', 'google_review_count', 'default_google_review_url']),
      ]);
      if (summaryRes.error) throw summaryRes.error;
      setSummary(summaryRes.data as Summary);
      const map = new Map((metricsRes.data || []).map(r => [r.metric_key, r]));
      setGoogleRating(String(map.get('google_rating')?.value_numeric || ''));
      setReviewCount(String(map.get('google_review_count')?.value_numeric || ''));
      setReviewUrl(String(map.get('default_google_review_url')?.value_text || ''));
    } catch (e: any) {
      console.error('[ReviewsWidget]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const upserts = [
        { metric_key: 'google_rating', value_numeric: parseFloat(googleRating) || 0 },
        { metric_key: 'google_review_count', value_numeric: parseInt(reviewCount, 10) || 0 },
        { metric_key: 'default_google_review_url', value_text: reviewUrl.trim() || null },
      ];
      for (const up of upserts) {
        await supabase.from('business_metrics').upsert(up, { onConflict: 'metric_key' });
      }
      toast.success('Saved review config');
      setConfigOpen(false);
      loadAll();
    } catch (e: any) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="p-5 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  const rating = parseFloat(googleRating) || 0;
  const count = parseInt(reviewCount, 10) || 0;
  const ratingColor = rating >= 4.8 ? 'text-emerald-600' : rating >= 4.5 ? 'text-amber-600' : 'text-red-600';
  const countColor = count >= 50 ? 'text-emerald-600' : 'text-gray-500';

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          Google Reviews
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)}>
          <Settings className="h-3.5 w-3.5 mr-1" /> Config
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Current rating</p>
            <p className={`text-2xl font-bold mt-1 ${ratingColor}`}>{rating.toFixed(1)}★</p>
            <p className="text-[10px] text-gray-400 mt-0.5">target 4.8+</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Total reviews</p>
            <p className={`text-2xl font-bold mt-1 ${countColor}`}>{count}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">target 50+</p>
          </div>
        </div>

        <div className="text-xs text-gray-600 space-y-1 border-t pt-3">
          <p className="font-semibold text-gray-700 mb-2">Last 30 days of review asks:</p>
          <p>📤 Sent: <strong>{summary?.sent ?? 0}</strong></p>
          {summary && summary.clicked > 0 && (
            <p>👆 Clicked: <strong>{summary.clicked}</strong> ({((summary.clicked / Math.max(summary.sent, 1)) * 100).toFixed(0)}% CTR)</p>
          )}
          {summary && summary.with_rating > 0 && (
            <p>⭐ Posted: <strong>{summary.with_rating}</strong> · avg {summary.avg_rating_if_known?.toFixed(1)}</p>
          )}
          {summary && summary.sent === 0 && (
            <p className="text-gray-400 italic">No asks yet. Mark appointments as "completed" — the 48h follow-up queues automatically.</p>
          )}
        </div>

        {!reviewUrl && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            ⚠️ Corporate Google review URL not configured. Review-request sequences will skip until you add one via Config.
          </div>
        )}
      </CardContent>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Google Review Config</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-gray-600">Review link (Google Maps short URL)</label>
              <Input
                placeholder="https://g.page/r/..."
                value={reviewUrl}
                onChange={e => setReviewUrl(e.target.value)}
              />
              <p className="text-[10px] text-gray-500 mt-1">Find it at Google Business Profile → Get more reviews → Share review form.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Current rating (0-5)</label>
                <Input type="number" step="0.1" value={googleRating} onChange={e => setGoogleRating(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-gray-600">Total review count</label>
                <Input type="number" value={reviewCount} onChange={e => setReviewCount(e.target.value)} />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">Update weekly from Google Business Profile. (Auto-sync via API coming later.)</p>
            <Button onClick={saveConfig} disabled={saving} className="w-full bg-[#B91C1C] hover:bg-[#991B1B]">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ReviewsWidget;
