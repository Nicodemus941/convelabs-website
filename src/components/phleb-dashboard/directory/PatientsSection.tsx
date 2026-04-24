import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import PatientSearchList, { PatientListRow } from '@/components/shared/PatientSearchList';
import PatientDetailDrawer from '@/components/shared/PatientDetailDrawer';

/**
 * PatientsSection — read-only patient roster for the phleb.
 * Shows only patients this phleb has served (via get_phleb_served_patients RPC).
 * Row click opens the shared PatientDetailDrawer with canEdit=false.
 */
const PatientsSection: React.FC = () => {
  const [rows, setRows] = useState<PatientListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState<string | null>(null);
  const [focusedOrgId, setFocusedOrgId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_phleb_served_patients' as any);
        if (error) throw error;
        setRows((data || []) as PatientListRow[]);
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
      <PatientSearchList
        patients={rows}
        loading={loading}
        emptyMessage="No patients yet — appointments you complete will show here."
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
