/**
 * PatientBenefitsCard — the live "what you actually get" panel for
 * VIP / Concierge / Member patients. Founding-50 VIPs see the full stack
 * (rate-lock + free family slot + same-day waiver + Saturday) with a
 * year-to-date savings counter and a 1/1 family-slot tracker.
 *
 * Why this page exists (Hormozi: "The discount only works if the customer
 * can see it"):
 *   • Mariela Sadrameli (Founding #2) texted asking if her perks were
 *     working. Mid-May 2026 — fixed by giving every member a single
 *     dashboard surface where every promise on BonusStackCard maps to a
 *     live status row + measurable dollar value.
 *
 * Behaviour:
 *   • Reads user_memberships + appointments for the logged-in user.
 *   • Tier = vip/concierge → renders the panel. Tier = none/member → no-op.
 *   • Founding flag controls the "Founding rate locked for life · #N" badge
 *     and the family-slot tracker (1/1 free vs 1/1 unused).
 *   • Year-to-date savings = sum of (non-member price - member-tier price)
 *     across completed visits this calendar year. Surfaces the receipt the
 *     patient otherwise has to compute mentally.
 *   • "Add Family Member" CTA deep-links to /book-now with a clarifying
 *     prompt that the family member must be drawn at THIS visit — not a
 *     separate appointment (operational rule).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, Users, Sparkles, Calendar as CalIcon, Check, Info, Plus, Crown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

type Tier = 'none' | 'member' | 'vip' | 'concierge';

// Mirrors TIER_PRICING in src/services/pricing/pricingService.ts (just the
// fields we need to compute YTD savings — keep in sync if pricing changes).
const TIER_SAVINGS: Record<string, Record<Tier, number>> = {
  mobile:                       { none: 150, member: 130, vip: 115, concierge: 99  },
  'in-office':                  { none: 55,  member: 49,  vip: 45,  concierge: 39  },
  senior:                       { none: 100, member: 85,  vip: 75,  concierge: 65  },
  'specialty-kit':              { none: 185, member: 165, vip: 150, concierge: 135 },
  'specialty-kit-genova':       { none: 200, member: 180, vip: 165, concierge: 150 },
  therapeutic:                  { none: 200, member: 180, vip: 165, concierge: 150 },
  'partner-restoration-place':  { none: 125, member: 115, vip: 99,  concierge: 85  },
  'partner-naturamed':          { none: 85,  member: 80,  vip: 75,  concierge: 65  },
  'partner-nd-wellness':        { none: 85,  member: 80,  vip: 75,  concierge: 65  },
};

interface MembershipRow {
  tier: Tier;
  founding_member: boolean;
  founding_member_number: number | null;
  founding_locked_rate_cents: number | null;
  next_renewal: string | null;
  status: string;
}

const PatientBenefitsCard: React.FC = () => {
  const { user } = useAuth();
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [ytdSavingsCents, setYtdSavingsCents] = useState(0);
  const [visitCountYTD, setVisitCountYTD] = useState(0);
  const [familyAddedThisYear, setFamilyAddedThisYear] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Pull membership row + tenant_patients tier mirror — either source
        // is authoritative; we trust whichever is set.
        const [{ data: um }, { data: tp }] = await Promise.all([
          supabase
            .from('user_memberships')
            .select('founding_member, founding_member_number, founding_locked_rate_cents, next_renewal, status, plan:plan_id(name)')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle(),
          supabase
            .from('tenant_patients')
            .select('membership_tier')
            .eq('user_id', user.id)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        // Derive tier from plan name; fall back to tenant_patients mirror.
        const planName = String((um as any)?.plan?.name || '').toLowerCase();
        let tier: Tier = 'none';
        if (planName.includes('concierge')) tier = 'concierge';
        else if (planName.includes('vip')) tier = 'vip';
        else if (planName) tier = 'member';
        else if ((tp as any)?.membership_tier) tier = (tp as any).membership_tier as Tier;

        if (!um && tier === 'none') { setLoading(false); return; }

        setMembership({
          tier,
          founding_member: Boolean((um as any)?.founding_member),
          founding_member_number: (um as any)?.founding_member_number ?? null,
          founding_locked_rate_cents: (um as any)?.founding_locked_rate_cents ?? null,
          next_renewal: (um as any)?.next_renewal ?? null,
          status: (um as any)?.status ?? 'active',
        });

        // YTD savings — completed appointments this calendar year.
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
        const { data: appts } = await supabase
          .from('appointments')
          .select('service_type, status, appointment_date, total_amount, additional_patients')
          .eq('patient_id', user.id)
          .gte('appointment_date', yearStart);

        let savings = 0;
        let visits = 0;
        let familyCount = 0;
        for (const a of (appts || []) as any[]) {
          if (a.status !== 'completed') continue;
          visits++;
          const svc = String(a.service_type || '');
          const matrix = TIER_SAVINGS[svc];
          if (matrix) {
            const delta = (matrix.none - (matrix[tier] ?? matrix.none)) * 100;
            if (delta > 0) savings += delta;
          }
          // Count family/additional-patient slots used this year.
          const ap = Array.isArray(a.additional_patients) ? a.additional_patients : [];
          familyCount += ap.length;
        }
        setYtdSavingsCents(savings);
        setVisitCountYTD(visits);
        setFamilyAddedThisYear(familyCount);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const isVip = membership?.tier === 'vip' || membership?.tier === 'concierge';
  const isFoundingVip = isVip && Boolean(membership?.founding_member);

  // Family slot — only Founding-50 VIPs get the FREE first family slot.
  // Regular VIPs still pay $45 (40% off) for family adds.
  const foundingFamilyFreeSlotsTotal = isFoundingVip ? 1 : 0;
  const foundingFamilyFreeSlotsUsed = isFoundingVip ? Math.min(familyAddedThisYear, 1) : 0;
  const foundingFamilyFreeSlotsLeft = Math.max(0, foundingFamilyFreeSlotsTotal - foundingFamilyFreeSlotsUsed);

  const renewalDateLabel = useMemo(() => {
    if (!membership?.next_renewal) return null;
    try {
      return new Date(membership.next_renewal).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return null; }
  }, [membership?.next_renewal]);

  if (loading || !membership || membership.tier === 'none') return null;

  const tierLabel = membership.tier === 'concierge' ? 'Concierge'
    : membership.tier === 'vip' ? 'VIP'
    : 'Member';

  return (
    <Card className="border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-white to-white shadow-md mb-6">
      <CardContent className="p-5 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crown className="h-5 w-5 text-amber-600" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700">Your {tierLabel} Benefits</span>
            </div>
            {isFoundingVip ? (
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                Founding Member #{membership.founding_member_number} ·{' '}
                <span className="text-amber-700">rate locked for life</span>
              </h3>
            ) : (
              <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                {tierLabel} Member ·{' '}
                <span className="text-emerald-700">${(ytdSavingsCents / 100).toFixed(0)} saved this year</span>
              </h3>
            )}
          </div>
          {renewalDateLabel && (
            <Badge variant="outline" className="bg-white text-[10px] whitespace-nowrap">
              Renews {renewalDateLabel}
            </Badge>
          )}
        </div>

        {/* YTD savings */}
        {visitCountYTD > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">Saved this year</p>
                <p className="text-2xl font-bold text-emerald-800">${(ytdSavingsCents / 100).toFixed(0)}</p>
                <p className="text-[11px] text-emerald-700 mt-0.5">{visitCountYTD} visit{visitCountYTD === 1 ? '' : 's'} at {tierLabel} pricing</p>
              </div>
              {ytdSavingsCents >= 19900 && (
                <Badge className="bg-emerald-600 text-white text-[10px]">
                  ✓ Membership paid for itself
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Family slot tracker — founding VIPs only */}
        {isFoundingVip && (
          <div className="bg-white border-2 border-amber-300 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Users className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-gray-900">Free family add-on</p>
                  <Badge className={foundingFamilyFreeSlotsLeft > 0 ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}>
                    {foundingFamilyFreeSlotsLeft} of {foundingFamilyFreeSlotsTotal} unused
                  </Badge>
                </div>
                <p className="text-[12px] text-gray-700 leading-snug">
                  As a Founding VIP, your first household member is drawn for <strong>$0</strong> on the same visit as you.
                  After that, additional members are $45 each (40% off standard).
                </p>
                <div className="mt-2 bg-blue-50 border border-blue-200 rounded px-3 py-2 flex items-start gap-2">
                  <Info className="h-3.5 w-3.5 text-blue-700 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-900 leading-snug">
                    <strong>Same-visit rule:</strong> family members must be drawn at the same appointment as you,
                    not a separate one. Add them at checkout under "Add Family Member."
                  </p>
                </div>
                {foundingFamilyFreeSlotsLeft > 0 && (
                  <Button asChild size="sm" className="mt-3 bg-amber-600 hover:bg-amber-700 text-white text-xs">
                    <Link to="/book-now?addFamily=1">
                      <Plus className="h-3.5 w-3.5 mr-1" /> Book visit + add family member
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Perk checklist */}
        <div className="grid sm:grid-cols-2 gap-2">
          {/* Rate lock — founding only */}
          {isFoundingVip && (
            <PerkRow
              icon={Lock}
              label="$199 rate locked for life"
              detail={`Your $${((membership.founding_locked_rate_cents ?? 19900) / 100).toFixed(0)}/yr never raises — even when we raise the public rate.`}
              tone="amber"
            />
          )}
          {/* Saturday access — all VIP + Concierge */}
          <PerkRow
            icon={CalIcon}
            label="Saturday access · no surcharge"
            detail="Book Saturday 6–11am visits without the $75 weekend fee."
            tone="emerald"
          />
          {/* Same-day waiver — founding VIP + concierge */}
          {(isFoundingVip || membership.tier === 'concierge') && (
            <PerkRow
              icon={Sparkles}
              label="Same-day STAT · no surcharge"
              detail="Urgent draws skip the $100 STAT fee."
              tone="amber"
            />
          )}
          {/* Reschedule waiver — all VIP+ */}
          <PerkRow
            icon={Check}
            label="Reschedule fee · waived"
            detail="Move your visit anytime without penalty."
            tone="gray"
          />
          {/* Member pricing on every visit */}
          <PerkRow
            icon={Check}
            label={`${tierLabel} pricing on every visit`}
            detail={membership.tier === 'vip' ? 'Mobile $115 · Restoration Place $99 · In-office $45'
              : membership.tier === 'concierge' ? 'Mobile $99 · Restoration Place $85 · In-office $39'
              : 'Mobile $130 · In-office $49'}
            tone="emerald"
          />
        </div>

        {/* Quick actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="text-xs">
            <Link to="/book-now">Book a visit</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-xs text-gray-600">
            <Link to="/profile">Manage account</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const PerkRow: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  detail: string;
  tone: 'amber' | 'emerald' | 'gray';
}> = ({ icon: Icon, label, detail, tone }) => {
  const toneCls = tone === 'amber'
    ? 'bg-amber-50 border-amber-200'
    : tone === 'emerald'
    ? 'bg-emerald-50 border-emerald-200'
    : 'bg-gray-50 border-gray-200';
  const iconCls = tone === 'amber'
    ? 'text-amber-700'
    : tone === 'emerald'
    ? 'text-emerald-700'
    : 'text-gray-700';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${iconCls}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 leading-tight">{label}</p>
          <p className="text-[11px] text-gray-600 leading-snug mt-0.5">{detail}</p>
        </div>
      </div>
    </div>
  );
};

export default PatientBenefitsCard;
