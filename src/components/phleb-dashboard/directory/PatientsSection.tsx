import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PatientSearchList, { PatientListRow } from '@/components/shared/PatientSearchList';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';
import { AlertCircle } from 'lucide-react';
import { loginRouteForTarget } from '@/lib/appTarget';

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
  const phlebLoginRoute = loginRouteForTarget('phleb');

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
        // The RPC returns { patient_name, email, phone, last_visit_at,
        // total_visits, organization_id } — but PatientSearchList/PatientListRow
        // read patient_email / patient_phone / visit_count / last_visit_date.
        // Without this remap the rows rendered blank (no email/phone/visits) and
        // search-by-email/phone matched nothing — the "directory does nothing"
        // report. Map the RPC shape onto the row shape here.
        const mapped: PatientListRow[] = ((data as any[]) || []).map((r) => ({
          patient_name: r.patient_name,
          patient_email: r.email ?? r.patient_email ?? null,
          patient_phone: r.phone ?? r.patient_phone ?? null,
          visit_count: r.total_visits ?? r.visit_count ?? null,
          last_visit_date: r.last_visit_at ?? r.last_visit_date ?? null,
          // carry the org id so the detail drawer can scope correctly without
          // a second round-trip (null for direct/mobile patients).
          _organization_id: r.organization_id ?? null,
        })) as any;
        setRows(mapped);
      } catch (e: any) {
        console.error('[phleb-directory] Patients load failed:', e);
        setErr(e?.message || String(e) || 'Failed to load patients');
      } finally { setLoading(false); }
    })();
  }, []);

  const openDetail = async (p: PatientListRow) => {
    // Use the org id the RPC already returned with the row. May be null for
    // direct/mobile patients — that's fine: the drawer shows ALL of the
    // patient's visits when no org is scoped (patient-centric view), which is
    // exactly what a phleb wants. No second query needed.
    setFocusedOrgId((p as any)._organization_id || '');
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
                onClick={async () => { await supabase.auth.signOut(); window.location.href = phlebLoginRoute; }}
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
