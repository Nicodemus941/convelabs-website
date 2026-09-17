import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Pencil,
  Rocket,
} from 'lucide-react';

interface OrgReadinessCardProps {
  org: {
    id: string;
    name: string;
    is_active: boolean;
    contact_email?: string | null;
    contact_phone?: string | null;
    billing_email?: string | null;
    portal_enabled?: boolean | null;
    default_billed_to?: 'patient' | 'org' | null;
    locked_price_cents?: number | null;
    org_invoice_price_cents?: number | null;
    welcomed_at?: string | null;
    subscription_tier?: string | null;
    subscription_status?: string | null;
  };
  onEdit?: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  organization_name: 'Organization name',
  contact_email: 'Main contact email',
  contact_phone: 'Main phone',
  fax: 'Fax for result routing',
  manager_email: 'Office manager email',
  front_desk_email: 'Front-desk email',
  address: 'Practice address',
  hours_of_operation: 'Hours of operation',
  lab_accounts: 'Lab account list',
  at_least_one_provider: 'At least one provider',
  provider_npi: 'Provider NPI',
  tax_id: 'Tax ID',
};

type CompletenessRow = {
  pct: number;
  total_fields: number;
  missing: string[];
};

type ChecklistItem = {
  key: string;
  label: string;
  done: boolean;
  help: string;
};

const OrgReadinessCard: React.FC<OrgReadinessCardProps> = ({ org, onEdit }) => {
  const [loading, setLoading] = useState(true);
  const [completeness, setCompleteness] = useState<CompletenessRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.rpc(
        'get_org_profile_completeness' as never,
        { p_org_id: org.id } as never,
      );
      const row = Array.isArray(data) ? (data[0] as CompletenessRow | undefined) : undefined;
      setCompleteness(row || { pct: 0, total_fields: 12, missing: ['organization_not_found'] });
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => {
    load();
  }, [load]);

  const readiness = useMemo(() => {
    const pct = completeness?.pct ?? 0;
    const missing = completeness?.missing ?? [];
    const orgBillingAmountCents = org.org_invoice_price_cents ?? org.locked_price_cents ?? 0;
    const billingModeSet = org.default_billed_to === 'patient' || org.default_billed_to === 'org';
    const orgBillingReady = org.default_billed_to !== 'org'
      || (!!org.billing_email && orgBillingAmountCents > 0);

    const checklist: ChecklistItem[] = [
      {
        key: 'active',
        label: 'Organization is active',
        done: !!org.is_active,
        help: 'Inactive orgs stay hidden from most operational views.',
      },
      {
        key: 'owner_contact',
        label: 'Owner contact is on file',
        done: !!org.contact_email && !!org.contact_phone,
        help: 'Need both email and phone so onboarding and scheduling do not stall.',
      },
      {
        key: 'portal',
        label: 'Provider portal is enabled',
        done: !!org.portal_enabled,
        help: 'The practice needs a working login path to finish its profile and roster setup.',
      },
      {
        key: 'welcome',
        label: 'Welcome has been sent',
        done: !!org.welcomed_at,
        help: 'The org should get its access + next-step instructions before pilot use.',
      },
      {
        key: 'profile',
        label: 'Practice profile is at least 80% complete',
        done: pct >= 80,
        help: '80% is the threshold where roster + workflow setup stops being fragile.',
      },
      {
        key: 'billing_mode',
        label: 'Billing route is explicitly set',
        done: billingModeSet,
        help: 'Every org needs a clear patient-billed vs org-billed default before pilot use.',
      },
      {
        key: 'org_billing',
        label: 'Org-billed workflow is configured',
        done: orgBillingReady,
        help: org.default_billed_to === 'org'
          ? 'Org-billed practices need a billing email and an org invoice price.'
          : 'Patient-billed practices do not need org invoicing yet.',
      },
    ];

    const doneCount = checklist.filter(item => item.done).length;
    const score = Math.round((doneCount / checklist.length) * 100);
    const pilotReady = checklist.every(item => item.done);

    const status = pilotReady
      ? { label: 'Pilot ready', tone: 'success' as const }
      : score >= 60
        ? { label: 'In setup', tone: 'warning' as const }
        : { label: 'Needs setup', tone: 'neutral' as const };

    const blockers = [
      ...missing.map(item => FIELD_LABELS[item] || item.replace(/_/g, ' ')),
    ];

    if (org.default_billed_to === 'org' && !org.billing_email) {
      blockers.push('Billing email for org-billed invoices');
    }
    if (org.default_billed_to === 'org' && orgBillingAmountCents <= 0) {
      blockers.push('Org invoice price');
    }
    if (!org.welcomed_at) {
      blockers.push('Welcome email / onboarding handoff');
    }

    return {
      pct,
      score,
      status,
      checklist,
      blockers: Array.from(new Set(blockers)),
      profileMissing: missing,
    };
  }, [completeness, org.billing_email, org.contact_email, org.contact_phone, org.default_billed_to, org.is_active, org.locked_price_cents, org.org_invoice_price_cents, org.portal_enabled, org.welcomed_at]);

  const badgeClassName = readiness.status.tone === 'success'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : readiness.status.tone === 'warning'
      ? 'bg-amber-100 text-amber-800 border-amber-200'
      : 'bg-gray-100 text-gray-700 border-gray-200';

  return (
    <Card className="shadow-sm border-slate-200 bg-gradient-to-br from-slate-50/80 to-white">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ClipboardList className="h-4 w-4 text-slate-700" />
              <p className="font-semibold text-sm">Pilot readiness</p>
              <Badge variant="outline" className={badgeClassName}>{readiness.status.label}</Badge>
              {org.subscription_tier && (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {org.subscription_tier} {org.subscription_status || 'trialing'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Build now, keep dark, and only onboard once this org is operationally safe.
            </p>
          </div>
          {onEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit org
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading readiness…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Readiness score</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{readiness.score}%</p>
                <p className="text-[11px] text-gray-500 mt-1">Internal staging confidence</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Profile completion</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{readiness.pct}%</p>
                <p className="text-[11px] text-gray-500 mt-1">Provider-facing setup completeness</p>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Billing mode</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {org.default_billed_to === 'org'
                    ? 'Org billed'
                    : org.default_billed_to === 'patient'
                      ? 'Patient billed'
                      : 'Unset'}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {org.default_billed_to === 'org'
                    ? 'Practice pays by invoice'
                    : org.default_billed_to === 'patient'
                      ? 'Patient pays at booking'
                      : 'Choose a default payer before pilot use'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {readiness.checklist.map(item => (
                <div key={item.key} className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2">
                  {item.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-[11px] text-gray-500">{item.help}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className={`rounded-lg border px-3 py-3 ${readiness.status.tone === 'success' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-2">
                <Rocket className={`h-4 w-4 mt-0.5 flex-shrink-0 ${readiness.status.tone === 'success' ? 'text-emerald-700' : 'text-amber-700'}`} />
                <div>
                  <p className={`text-sm font-semibold ${readiness.status.tone === 'success' ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {readiness.status.tone === 'success'
                      ? `${org.name} can enter the mid-September pilot queue`
                      : `${org.name} still has setup blockers before pilot onboarding`}
                  </p>
                  {readiness.blockers.length > 0 ? (
                    <p className={`text-[11px] mt-1 ${readiness.status.tone === 'success' ? 'text-emerald-700' : 'text-amber-800'}`}>
                      Next blockers: {readiness.blockers.slice(0, 4).join(', ')}
                      {readiness.blockers.length > 4 ? `, +${readiness.blockers.length - 4} more` : ''}
                    </p>
                  ) : (
                    <p className="text-[11px] mt-1 text-emerald-700">
                      Core onboarding, billing, and profile requirements are covered.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default OrgReadinessCard;
