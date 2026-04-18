import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Repeat, Calendar, PauseCircle, PlayCircle, SkipForward, XCircle, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/sonner';
import { format } from 'date-fns';

/**
 * MY RECURRING PLANS — patient self-service for Tier 3 subscriptions.
 *
 * Lists the patient's active recurring_bookings rows with Pause / Resume /
 * Skip / Cancel actions. Every action calls the manage-subscription edge
 * function, which verifies ownership via JWT before acting.
 *
 * Hormozi: "Make pause easy — it saves cancellations."
 */

interface Plan {
  id: string;
  service_type: string;
  service_name: string | null;
  frequency_weeks: number;
  next_booking_date: string | null;
  per_visit_price_cents: number | null;
  discount_percent: number | null;
  paused_until: string | null;
  is_active: boolean;
  cancelled_at: string | null;
  preferred_day_of_week: number | null;
  preferred_time: string | null;
  preferred_address: string | null;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dollars(cents: number | null | undefined): string {
  if (!cents) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

const MyRecurringPlans: React.FC = () => {
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [pauseDialogFor, setPauseDialogFor] = useState<Plan | null>(null);
  const [pauseUntil, setPauseUntil] = useState<string>('');

  const load = useCallback(async () => {
    if (!user?.email) { setLoading(false); return; }
    setLoading(true);
    try {
      // RLS may scope by auth.uid() but we also match by email as fallback
      const { data } = await supabase
        .from('recurring_bookings' as any)
        .select('*')
        .or(`patient_id.eq.${user.id || '00000000-0000-0000-0000-000000000000'},patient_email.eq.${user.email.toLowerCase()}`)
        .is('cancelled_at', null)
        .order('next_booking_date', { ascending: true });
      setPlans((data as any) || []);
    } catch (e) {
      console.warn('[MyRecurringPlans] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => { load(); }, [load]);

  const act = async (bookingId: string, action: 'pause' | 'resume' | 'skip' | 'cancel', extra?: Record<string, any>) => {
    setBusy(bookingId + ':' + action);
    try {
      const { data, error } = await supabase.functions.invoke('manage-subscription', {
        body: { bookingId, action, ...extra },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const messages: Record<string, string> = {
        pause: 'Plan paused — you won\'t be auto-billed until it resumes.',
        resume: 'Plan resumed. Next visit returns to your regular cadence.',
        skip: 'Next visit skipped. Pushed to the following cycle.',
        cancel: 'Plan cancelled. No further charges. Thanks for being with us.',
      };
      toast.success(messages[action] || 'Done');
      await load();
    } catch (e: any) {
      console.error(`[${action}] failed`, e);
      toast.error(e?.message || `Failed to ${action} plan — please call us (941) 527-9169`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (plans.length === 0) {
    // Don't render anything if patient has no plans — avoid empty-state clutter
    return null;
  }

  return (
    <>
      <Card className="shadow-sm border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Repeat className="h-4 w-4 text-emerald-600" />
            My Recurring Plans
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plans.map((p) => {
            const isPaused = p.paused_until && new Date(p.paused_until) > new Date();
            const activeAction = busy?.startsWith(p.id + ':') ? busy.split(':')[1] : null;
            return (
              <div key={p.id} className="border rounded-lg p-3 bg-white">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {p.service_name || 'Blood Draw'}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Every {p.frequency_weeks} week{p.frequency_weeks !== 1 ? 's' : ''}
                      {p.preferred_day_of_week !== null && ` on ${DOW[p.preferred_day_of_week]}s`}
                      {p.preferred_time && ` at ${p.preferred_time}`}
                    </p>
                    {p.per_visit_price_cents && (
                      <p className="text-xs text-emerald-700 font-semibold mt-0.5">
                        {dollars(p.per_visit_price_cents)}/visit
                        {p.discount_percent ? ` · ${p.discount_percent}% off` : ''}
                      </p>
                    )}
                  </div>
                  {isPaused ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700 border border-amber-200">
                      <PauseCircle className="h-2.5 w-2.5" /> Paused
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <Sparkles className="h-2.5 w-2.5" /> Active
                    </span>
                  )}
                </div>

                {p.next_booking_date && !isPaused && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                    <Calendar className="h-3 w-3" />
                    Next visit: <strong>{format(new Date(p.next_booking_date + 'T12:00:00'), 'EEE, MMM d')}</strong>
                  </div>
                )}
                {isPaused && p.paused_until && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 mb-2">
                    <PauseCircle className="h-3 w-3" />
                    Resumes: <strong>{format(new Date(p.paused_until + 'T12:00:00'), 'EEE, MMM d')}</strong>
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-2 border-t">
                  {isPaused ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      disabled={!!busy}
                      onClick={() => act(p.id, 'resume')}
                    >
                      {activeAction === 'resume' ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-8"
                      disabled={!!busy}
                      onClick={() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 1);
                        setPauseUntil(d.toISOString().slice(0, 10));
                        setPauseDialogFor(p);
                      }}
                    >
                      <PauseCircle className="h-3 w-3" />
                      Pause
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs h-8"
                    disabled={!!busy || isPaused}
                    onClick={() => {
                      if (confirm(`Skip your next visit? It will move to the following cycle (around ${
                        p.next_booking_date
                          ? format(new Date(new Date(p.next_booking_date + 'T12:00:00').getTime() + p.frequency_weeks * 7 * 86400000), 'MMM d')
                          : 'next cycle'
                      }).`)) {
                        act(p.id, 'skip');
                      }
                    }}
                  >
                    {activeAction === 'skip' ? <Loader2 className="h-3 w-3 animate-spin" /> : <SkipForward className="h-3 w-3" />}
                    Skip next
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs h-8 col-span-2 sm:col-span-2 border-red-200 text-red-600 hover:bg-red-50"
                    disabled={!!busy}
                    onClick={() => {
                      if (confirm('Cancel this recurring plan? Your Stripe subscription will stop billing. You can always start a new plan later.')) {
                        act(p.id, 'cancel');
                      }
                    }}
                  >
                    {activeAction === 'cancel' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    Cancel plan
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Pause-until date picker dialog */}
      <Dialog open={!!pauseDialogFor} onOpenChange={(v) => !v && setPauseDialogFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-amber-600" /> Pause plan until…
            </DialogTitle>
            <DialogDescription className="text-xs">
              We'll hold your plan — no auto-billing, no auto-scheduling — and resume on the date you pick.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Resume on</Label>
              <Input
                type="date"
                value={pauseUntil}
                min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                onChange={(e) => setPauseUntil(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPauseDialogFor(null)}>Never mind</Button>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!pauseUntil || !!busy}
                onClick={async () => {
                  if (!pauseDialogFor) return;
                  await act(pauseDialogFor.id, 'pause', { pausedUntil: pauseUntil });
                  setPauseDialogFor(null);
                }}
              >
                Pause until {pauseUntil || 'date'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MyRecurringPlans;
