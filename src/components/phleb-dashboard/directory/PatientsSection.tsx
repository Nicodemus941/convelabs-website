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
        // Also pull the current session so the error banner can tell the user
        // whether they're authenticated + as which role.
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id || 'no-session';
        const role = (sess?.session?.user?.user_metadata as any)?.role || 'unknown';
        const { data, error } = await supabase.rpc('get_phleb_served_patients' as any);
        if (error) {
          // Supabase PostgrestError shape
          throw new Error(
            `RPC failed · status=${(error as any).code || 'n/a'} · ${error.message || 'no message'} · hint: ${(error as any).hint || 'n/a'} · as user ${uid} (role: ${role})`
          );
        }
        // eslint-disable-next-line no-console
        console.log(`[phleb-directory] Patients RPC returned ${data?.length ?? 0} rows (uid=${uid}, role=${role})`);
        setRows((data || []) as PatientListRow[]);
      } catch (e: any) {
        console.error('[phleb-directory] Patients load failed:', e);
        setErr(e?.message || String(e) || 'Failed to load patients');
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
          <div className="text-xs text-red-800 flex-1 min-w-0">
            <p className="font-semibold">Couldn't load patients</p>
            <p className="mt-1 font-mono text-[11px] break-all bg-white/60 rounded px-1.5 py-1 border border-red-100">
              {err}
            </p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setErr(null); setLoading(true); setRows([]); window.location.reload(); }}
                className="text-[11px] underline font-semibold text-red-700"
              >
                Retry (reload page)
              </button>
              <button
                type="button"
                onClick={async () => { await supabase.auth.signOut(); window.location.href = '/provider-login'; }}
                className="text-[11px] underline font-semibold text-red-700"
              >
                Sign out + back in
              </button>
            </div>
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
