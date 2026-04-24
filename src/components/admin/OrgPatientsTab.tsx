import React, { useCallback, useEffect, useState } from 'react';
import PatientSearchList, { PatientListRow } from '@/components/shared/PatientSearchList';
import AddPatientModal from '@/components/shared/AddPatientModal';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * OrgPatientsTab — admin-side lens on one org's patient list.
 *
 * Uses get_patients_for_org_admin RPC (admin-only; RLS'd to super_admin /
 * admin / office_manager roles). Lists every patient who's ever had a
 * non-cancelled appointment linked to this org, with search, filter,
 * and add-patient support.
 *
 * Click a row → (future) slide-in patient detail drawer with full visit
 * history + specimen tracking IDs. Stubbed for now to keep this ship tight.
 */

interface Props {
  orgId: string;
  orgName: string;
}

const OrgPatientsTab: React.FC<Props> = ({ orgId, orgName }) => {
  const [patients, setPatients] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusedPatient, setFocusedPatient] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_patients_for_org_admin' as any, { p_org_id: orgId });
      if (error) throw error;
      setPatients((data || []) as unknown as PatientListRow[]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">Patients for</p>
          <h3 className="text-lg font-bold text-gray-900">{orgName}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {patients.length} total · status dot shows visit recency + pending requests
        </p>
      </div>

      <PatientSearchList
        patients={patients}
        loading={loading}
        emptyMessage="No patients linked to this org yet. Add one to get started."
        onAddPatient={() => setAddOpen(true)}
        onRowClick={(p) => { setFocusedPatient(p.patient_name); setDetailOpen(true); }}
      />

      <AddPatientModal
        open={addOpen}
        onOpenChange={setAddOpen}
        organizationId={orgId}
        onCreated={load}
      />

      {focusedPatient && (
        <PatientDetailDrawer
          open={detailOpen}
          onOpenChange={(v) => { setDetailOpen(v); if (!v) setTimeout(load, 300); }}
          patientName={focusedPatient}
          organizationId={orgId}
          canEdit={true}
        />
      )}
    </div>
  );
};

export default OrgPatientsTab;
