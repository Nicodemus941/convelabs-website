import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Crown, Star, Sparkles, Heart } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

/**
 * PatientStatusChip — Hormozi rule: never make admin guess.
 *
 * Distinguishes formal paid membership from informal "longtime patient"
 * tenure so the word "VIP" stops being overloaded:
 *
 *   🟢 Member · VIP · save $35       — paid plan, system-applied discount
 *   🟡 Loyal patient · 14 visits      — informal tenure, no discount
 *   ⬜ (nothing rendered)             — new / one-time patient
 *
 * Reads from:
 *   - user_memberships (status='active', joined to membership_plans)
 *     for formal paid status. Falls back to checking patient's auth.user_id
 *     OR matching email to a membership holder's email (covers households
 *     where a partner / spouse holds the plan, e.g. Suzanne → Aditya).
 *   - appointments grouped by patient_id for tenure (count completed visits +
 *     earliest visit date) when no formal membership exists.
 *
 * Save amount per tier (matches pricingService.ts):
 *   member    → save $20 vs standard
 *   vip       → save $35
 *   concierge → save $51
 *
 * Props:
 *   patientId    — tenant_patients.id (preferred; uses joined-at on chart)
 *   patientEmail — fallback when patient_id is null on an appointment row
 *   compact      — render as a tiny pill (no save text)
 */

interface Props {
  patientId?: string | null;
  patientEmail?: string | null;
  compact?: boolean;
}

interface Status {
  kind: 'member' | 'vip' | 'concierge' | 'loyal' | 'none';
  saveAmount?: number;
  visitCount?: number;
  firstVisitDate?: string | null;
  foundingNumber?: number | null;
}

const SAVE_BY_TIER: Record<string, number> = {
  member: 20,
  vip: 35,
  concierge: 51,
};

const PatientStatusChip: React.FC<Props> = ({ patientId, patientEmail, compact }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId && !patientEmail) {
      setStatus({ kind: 'none' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1) FORMAL MEMBERSHIP — check via patient's auth user_id first
        let userId: string | null = null;
        if (patientId) {
          const { data: tp } = await supabase
            .from('tenant_patients')
            .select('user_id, email, created_at, household_primary_email')
            .eq('id', patientId)
            .maybeSingle();
          userId = (tp as any)?.user_id || null;
        }

        // Try to find an active membership owned by this user OR by anyone
        // sharing their household email (covers Suzanne → Aditya pattern)
        const emailLc = (patientEmail || '').toLowerCase().trim() || null;
        let mem: any = null;
        if (userId) {
          const { data } = await supabase
            .from('user_memberships' as any)
            .select('id, status, plan_id, founding_member_number, plan:membership_plans(name)')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          mem = data;
        }
        if (!mem && emailLc) {
          // Fall back: any active membership where the holder's auth email
          // matches this patient's email (e.g. household primary holder)
          const { data: holders } = await supabase
            .from('user_memberships' as any)
            .select('id, user_id, status, plan_id, founding_member_number, plan:membership_plans(name)')
            .eq('status', 'active');
          if (holders && holders.length > 0) {
            // Resolve their auth emails server-side via a single batched join
            const userIds = (holders as any[]).map(h => h.user_id).filter(Boolean);
            if (userIds.length > 0) {
              // Can't read auth.users from client; instead match via
              // tenant_patients.email when household_primary_id chains exist.
              const { data: patients } = await supabase
                .from('tenant_patients')
                .select('id, user_id, email, household_primary_id')
                .ilike('email', emailLc);
              const found = (patients as any[])?.find(p => userIds.includes(p.user_id));
              if (found) {
                mem = (holders as any[]).find(h => h.user_id === found.user_id) || null;
              }
            }
          }
        }

        if (mem) {
          const planName = String((mem as any).plan?.name || '').toLowerCase();
          const tier: 'member' | 'vip' | 'concierge' =
            planName.includes('concierge') ? 'concierge'
            : planName.includes('vip') ? 'vip'
            : 'member';
          if (!cancelled) {
            setStatus({
              kind: tier,
              saveAmount: SAVE_BY_TIER[tier],
              foundingNumber: (mem as any).founding_member_number || null,
            });
          }
          return;
        }

        // 2) INFORMAL — count completed visits + earliest visit date
        if (patientId) {
          const { data: appts } = await supabase
            .from('appointments')
            .select('id, appointment_date, status')
            .eq('patient_id', patientId)
            .in('status', ['completed', 'specimen_delivered'])
            .order('appointment_date', { ascending: true });
          const count = (appts as any[])?.length || 0;
          if (count >= 3) {
            if (!cancelled) {
              setStatus({
                kind: 'loyal',
                visitCount: count,
                firstVisitDate: (appts as any[])?.[0]?.appointment_date || null,
              });
            }
            return;
          }
        }

        if (!cancelled) setStatus({ kind: 'none' });
      } catch (e) {
        console.warn('[PatientStatusChip] lookup failed:', e);
        if (!cancelled) setStatus({ kind: 'none' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, patientEmail]);

  if (loading || !status || status.kind === 'none') return null;

  if (status.kind === 'loyal') {
    const since = status.firstVisitDate
      ? format(new Date(status.firstVisitDate), 'yyyy')
      : null;
    return (
      <Badge className={`bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-50 gap-1 ${compact ? 'text-[10px] px-1.5 h-4' : 'text-[11px]'}`}>
        <Heart className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} fill-amber-400 text-amber-500`} />
        {compact ? `Loyal · ${status.visitCount}` : `Loyal patient · ${status.visitCount} visits${since ? ` · since ${since}` : ''}`}
      </Badge>
    );
  }

  // Formal membership
  const Icon = status.kind === 'concierge' ? Sparkles : status.kind === 'vip' ? Crown : Star;
  const tierLabel = status.kind.charAt(0).toUpperCase() + status.kind.slice(1);
  const colors =
    status.kind === 'concierge' ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-50'
    : status.kind === 'vip' ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100'
    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-50';

  return (
    <Badge className={`${colors} gap-1 ${compact ? 'text-[10px] px-1.5 h-4' : 'text-[11px]'}`}>
      <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {compact
        ? `${tierLabel}${status.foundingNumber ? ` #${status.foundingNumber}` : ''}`
        : <>Member · {tierLabel}{status.foundingNumber ? ` #${status.foundingNumber}` : ''}{status.saveAmount ? ` · save $${status.saveAmount}` : ''}</>
      }
    </Badge>
  );
};

export default PatientStatusChip;
