import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';

/**
 * /dashboard/provider/patients/:patientId — one patient, as a real page.
 *
 * The practice asked for the obvious thing: click a patient's name and see
 * that patient. The chart itself is the same component the admin drawer uses;
 * here it is framed as a page so it can be linked to, refreshed and shared
 * between the people in the practice.
 *
 * The organisation comes from the signed-in user, never from the URL, and the
 * patient is loaded only if they belong to it.
 */
const ProviderPatientRecordPage: React.FC = () => {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; name: string; organizationId: string }
    | { kind: 'denied' }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const orgId = (auth?.user?.user_metadata as Record<string, unknown> | undefined)?.organization_id as string | undefined;
      if (!orgId || !patientId) {
        if (!cancelled) setState({ kind: 'denied' });
        return;
      }
      const { data, error } = await supabase
        .from('tenant_patients')
        .select('id, first_name, last_name, organization_id')
        .eq('id', patientId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as { first_name: string | null; last_name: string | null; organization_id: string | null } | null;
      // Belongs to this practice, or it does not exist as far as they know.
      if (error || !row || row.organization_id !== orgId) {
        setState({ kind: 'denied' });
        return;
      }
      setState({
        kind: 'ready',
        name: [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || 'This patient',
        organizationId: orgId,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5 -ml-2" onClick={() => navigate('/dashboard/provider?tab=patients')}>
        <ArrowLeft className="h-4 w-4" /> Back to patients
      </Button>

      {state.kind === 'loading' && (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading this patient…
        </div>
      )}

      {state.kind === 'denied' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-900 font-medium">We couldn&apos;t open that patient.</p>
          <p className="text-gray-500 text-sm mt-1">
            They may belong to another practice, or the link is out of date. Go back to your patients and try from the list.
          </p>
        </div>
      )}

      {state.kind === 'ready' && (
        <PatientDetailDrawer
          asPage
          open
          onOpenChange={() => navigate('/dashboard/provider?tab=patients')}
          patientName={state.name}
          tenantPatientId={patientId ?? null}
          organizationId={state.organizationId}
          canEdit
        />
      )}
    </div>
  );
};

export default ProviderPatientRecordPage;
