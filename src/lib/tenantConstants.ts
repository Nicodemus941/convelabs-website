/**
 * Single-tenant deployment constant. tenant_patients.tenant_id is NOT NULL
 * with no DB default, so every client-side insert MUST pass this explicitly.
 * (2026-07-13: AddPatientModal + BulkAddPatientsModal omitted it and every
 * provider "Add patient" failed with a 23502 — the Elite Medical Concierge
 * complaint. Import this constant instead of re-hardcoding the UUID.)
 */
export const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
