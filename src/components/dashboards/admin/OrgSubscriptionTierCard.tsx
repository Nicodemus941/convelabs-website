import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Crown, Users, Sparkles, Loader2 } from 'lucide-react';

/**
 * Subscription tier assignment for a practice. Part of the "ConveLabs
 * Concierge" subscription pivot — practice pays ConveLabs monthly per
 * enrolled patient, patient pays $0 at booking.
 *
 * Three tiers:
 *   Starter  $299/mo   10 seats, 1 draw/pt/mo, $30 overage
 *   Growth   $1,500/mo 50 seats, 2 draws/pt/mo, $25 overage ⭐
 *   Scale    $2,999/mo 200 seats, unlimited draws, $15 overage
 *
 * This card only sets the tier + shows enrollment counts. Stripe
 * subscription creation (recurring billing) ships in a separate pass.
 * Admin manually sets up the Stripe sub and pastes the ID for now.
 */

const TIERS = [
  { key: 'starter', name: 'Starter', price: 299, seatCap: 10, drawsPerMo: 1, overage: 30, blurb: 'Small practices testing the workflow' },
  { key: 'growth', name: 'Growth', price: 1500, seatCap: 50, drawsPerMo: 2, overage: 25, blurb: 'Best fit for most practices · recommended' },
  { key: 'scale', name: 'Scale', price: 2999, seatCap: 200, drawsPerMo: 999, overage: 15, blurb: 'High-volume practices + specialty' },
] as const;

interface Props {
  org: { id: string; name: string; subscription_tier?: string | null; subscription_status?: string | null; subscription_seat_cap?: number | null; subscription_started_at?: string | null };
  onChanged?: () => void;
}

const OrgSubscriptionTierCard: React.FC<Props> = ({ org, onChanged }) => {
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);

  const loadCount = async () => {
    const { count } = await supabase
      .from('practice_enrollments' as any)
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', org.id)
      .is('unenrolled_at', null);
    setEnrolledCount(count || 0);
  };

  useEffect(() => { loadCount(); }, [org.id]);

  const setTier = async (tierKey: string) => {
    setSaving(tierKey);
    try {
      const { error } = await supabase.rpc('apply_subscription_tier' as any, {
        p_org_id: org.id, p_tier: tierKey,
      });
      if (error) throw error;
      toast.success(`${org.name} is now on ${tierKey.toUpperCase()} tier`);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Tier update failed');
    } finally {
      setSaving(null);
    }
  };

  const clearTier = async () => {
    if (!window.confirm(`Remove ${org.name} from the Concierge subscription?`)) return;
    setSaving('clear');
    try {
      const { error } = await supabase.rpc('apply_subscription_tier' as any, {
        p_org_id: org.id, p_tier: '',
      });
      if (error) throw error;
      toast.success('Subscription cleared');
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Clear failed');
    } finally {
      setSaving(null);
    }
  };

  const currentTier = org.subscription_tier ? TIERS.find(t => t.key === org.subscription_tier) : null;
  const overageCount = currentTier ? Math.max(0, enrolledCount - currentTier.seatCap) : 0;

  return (
    <Card className="shadow-sm border-amber-200 bg-gradient-to-br from-amber-50/30 to-white">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Crown className="h-4 w-4 text-amber-600" />
          <p className="font-semibold text-sm">Concierge Subscription</p>
          {currentTier && (
            <>
              <Badge className="bg-amber-500 text-white uppercase text-[10px]">{currentTier.name}</Badge>
              <Badge variant="outline" className="text-[10px]">
                <Users className="h-3 w-3 mr-0.5" />{enrolledCount} / {currentTier.seatCap}
                {overageCount > 0 && <span className="ml-1 text-amber-800">· +{overageCount} overage</span>}
              </Badge>
              <Badge variant="outline" className="text-[10px] capitalize">{org.subscription_status || 'trialing'}</Badge>
            </>
          )}
          {!currentTier && (
            <span className="text-xs text-muted-foreground">Not on subscription · partner-per-visit billing</span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {TIERS.map(t => {
            const isCurrent = currentTier?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTier(t.key)}
                disabled={saving === t.key || isCurrent}
                className={`text-left p-3 rounded-lg border-2 transition ${isCurrent
                  ? 'border-amber-500 bg-amber-50 cursor-default'
                  : 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/40 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold text-sm">{t.name}</p>
                  {isCurrent && <Sparkles className="h-3.5 w-3.5 text-amber-600" />}
                  {saving === t.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />}
                </div>
                <p className="text-lg font-bold text-[#B91C1C]">${t.price}<span className="text-xs font-normal text-gray-500">/mo</span></p>
                <p className="text-[11px] text-gray-600 mt-1">
                  {t.seatCap} seats · {t.drawsPerMo === 999 ? 'unlimited' : `${t.drawsPerMo}/pt/mo`}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">{t.blurb}</p>
                <p className="text-[10px] text-gray-400 mt-1">${t.overage}/seat overage</p>
              </button>
            );
          })}
        </div>

        {currentTier && (
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pt-2 border-t">
            <p className="text-[11px] text-muted-foreground">
              Subscription started {org.subscription_started_at ? new Date(org.subscription_started_at).toLocaleDateString() : '—'}.
              Stripe billing wiring ships in a separate pass — create the Stripe sub manually for now and paste the sub id in the Edit modal.
            </p>
            <Button size="sm" variant="ghost" className="text-xs text-gray-500" onClick={clearTier} disabled={saving === 'clear'}>
              {saving === 'clear' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove from subscription'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrgSubscriptionTierCard;
