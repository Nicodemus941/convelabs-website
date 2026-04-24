import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PatientSearchList, { PatientListRow } from '@/components/shared/PatientSearchList';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';
import { AlertCircle } from 'lucide-react';

/**
 * PatientsSection — read-only patient roster for the phleb.
 * Shows patients this phleb has served (via get_phleb_served_patients RPC).
 * Admins viewing the phleb dashboard see ALL phleb patients (RPC allows it).
 * Row click opens the shared PatientDetailDrawer with canEdit=false.
 */
const PatientsSection: React.FC = () => {
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [focusedOrgId, setFocusedOrgId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_phleb_served_patients' as any);
        if (error) throw error;
        // eslint-disable-next-line no-console
        console.log(`[phleb-directory] Patients RPC returned ${data?.length ?? 0} rows`);
        setRows((data || []) as PatientListRow[]);
      } catch (e: any) {
        console.error('[phleb-directory] Patients load failed:', e);
        setErr(e?.message || 'Failed to load patients');
      } finally { setLoading(false); }
    })();
  }, []);

  const openDetail = async (p: PatientListRow) => {
    // Look up an org this patient has been linked to via any of the phleb's
    // appointments — the drawer needs one org context for its visit query.
    const { data } = await supabase
      .from('appointments')
      .select('organization_id')
      .ilike('patient_name', p.patient_name)
      .not('organization_id', 'is', null)
      .limit(1);
    setFocusedOrgId(((data || [])[0] as any)?.organization_id || '');
    setFocused(p.patient_name);
    setDrawerOpen(true);
  };

  return (
    <div>
      {err && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-red-800">
            <p className="font-semibold">Couldn't load patients</p>
            <p className="mt-0.5 opacity-90">{err}</p>
            <p className="mt-1 text-red-600">
              If you're logged in as admin and this is empty, hard-refresh (Ctrl+Shift+R). If you're a phleb and have no appointments assigned, the list will fill as visits roll in.
            </p>
          </div>
        </div>
      )}
      <PatientSearchList
        patients={rows}
        loading={loading}
        emptyMessage={err ? 'No patients loaded — see error above.' : 'No patients yet — appointments you complete will show here.'}
        onRowClick={openDetail}
      />
      {focused && (
        <PatientDetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          patientName={focused}
          organizationId={focusedOrgId || ''}
          canEdit={false}
        />
      )}
    </div>
  );
};

export default PatientsSection;
