/**
 * Patient name masking for high-privacy partner orgs.
 *
 * Organizations with `show_patient_name_on_appointment = false` (e.g., Clinical
 * Associates of Orlando) require the patient's name to NOT appear on any
 * admin / phleb / public-facing surface. We still store the full info in the
 * DB for HIPAA chain-of-custody; display is masked.
 *
 * Only `super_admin` role can unmask, and the action is audited (future: log
 * unmask events for HIPAA audit reports).
 */

export function getDisplayName(appt: {
  patient_name: string | null;
  patient_name_masked?: boolean | null;
  org_reference_id?: string | null;
  organization_id?: string | null;
}, opts?: { userRole?: string }): string {
  const canUnmask = opts?.userRole === 'super_admin';
  if (appt.patient_name_masked && !canUnmask) {
    return appt.org_reference_id || 'Confidential Patient';
  }
  return appt.patient_name || 'Unknown Patient';
}

export function isMasked(appt: { patient_name_masked?: boolean | null }, userRole?: string): boolean {
  return !!appt.patient_name_masked && userRole !== 'super_admin';
}
