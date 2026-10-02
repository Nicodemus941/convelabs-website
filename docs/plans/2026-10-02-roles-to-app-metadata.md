# Roles → `app_metadata` (privilege-escalation fix) — rollout runbook

Status: **Phase 1 APPLIED 2026-10-02 (517 users, 0 downgrades). Phase 2, edge functions and frontend: NOT yet applied/deployed.**
Branch: `security/roles-app-metadata`.

## The problem (verified 2026-10-02, read-only)

RLS policies, SECURITY DEFINER functions, edge functions and the SPA authorize
on `user_metadata.role` / `user_metadata.organization_id`. `user_metadata`
(`auth.users.raw_user_meta_data`) is writable by the signed-in user:

```js
await supabase.auth.updateUser({ data: { role: 'super_admin' } }) // any patient
```

Read-only simulation against prod (patient `b7f00f1c…`, `set local role authenticated`,
forged JWT claims, transaction rolled back):

| persona | appointments | tenant_patients | organizations | specimen_deliveries | org_invoices | sms_notifications | webhook_logs |
|---|---|---|---|---|---|---|---|
| patient, honest claims | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| same patient, `user_metadata.role = super_admin` | **523** (all) | **761** (all) | 169 | 415 | 9 | 1202 | 2376 |

Setting `organization_id` too would also open that org's lab requests, insurances,
addresses and invoices. Edge functions (payout sweep, reconcile, analytics, BAA,
lab-request, invite…) trust the same field.

## The fix

* Role + partner org live in **`app_metadata`** (`raw_app_meta_data`): only the
  service role can write it; it is still in the JWT as `app_metadata`.
* SQL helpers `public.jwt_role()` / `public.jwt_org_id()` (SECURITY DEFINER,
  STABLE, `search_path=''`): read the JWT `app_metadata` claim; if the token
  predates the backfill (no `app_metadata.role` claim) they read the live
  `auth.users.raw_app_meta_data` row instead → **no lockout window**, and role and
  org always come from the same source.
* Edge functions use `supabase/functions/_shared/authz.ts`
  (`getTrustedRole`, `getTrustedOrgId`, `roleAppMetadata`, `keepElevatedRole`).
  `auth.getUser(jwt)` returns the live row, so they are correct immediately after
  the backfill regardless of token age.
* SPA uses `src/lib/authRole.ts`. Routing reads `app_metadata.role`, falling back
  to `user_metadata.role` **only** when a stale session has no `app_metadata.role`
  at all (UI routing only — the server decides access).
* Writers (invites, org welcome/claim, staff invitation, team invite, provider
  plan checkout, phone-auth backfill) now set `app_metadata`. Self-service
  `signUp()` can only yield `patient` / `concierge_doctor` (DB trigger). The client
  no longer stamps roles (`useSuperAdminAuth`, `superAdminLogin`, `Dashboard`).

Files:
* `supabase/migrations/20261002130000_roles_to_app_metadata.sql` — phase 1:
  helpers, `role_migration_audit`, backfill, signup default trigger, revoke
  `setup_initial_admin()`. Changes no authorization decision by itself.
* `supabase/migrations/20261002130100_roles_to_app_metadata_enforce.sql` — phase 2:
  59 policies + 10 functions switched to the helpers.

## Inventory (live DB + repo, 2026-10-02)

**RLS policies reading user_metadata / raw_user_meta_data: 59 on 38 tables.**
* 40 JWT-based (`auth.jwt()->'user_metadata'`) → `jwt_role()` / `jwt_org_id()`.
* 19 legacy `EXISTS (SELECT 1 FROM auth.users WHERE raw_user_meta_data->>'role' …)`
  → `public.has_any_role(...)` (admin-managed `user_roles`). **These currently
  error with `permission denied for table users` for every authenticated query**
  (verified): `corporate_employees, credit_pools, performance_reviews,
  phlebotomist_locations, quality_incidents, quality_metrics, route_plans,
  route_stops, scheduled_campaigns, service_areas, service_logs,
  staff_certifications, staff_training, stripe_balance_transactions,
  stripe_payments, stripe_payouts, sync_metadata, webhook_events`, and
  `storage.objects` (`staff_onboarding_read_own`) — i.e. **every authenticated
  SELECT on storage.objects currently errors**. Phase 2 makes them evaluate.
  (`phlebotomist_schedules."Allow admins to manage all phlebotomist schedules"`
  also references `auth.users` but not metadata — same error, not touched here.)

**SQL functions (pg_proc) reading user/app metadata: 20.**
Rewritten (authorization): `check_patient_cross_org_collision`,
`get_org_linked_patients`, `get_org_linked_patients_logged`, `get_org_roi`,
`get_patients_for_org_admin` (org only), `list_org_staff_admin`,
`enforce_phleb_compliance`, `resync_appointment_card_totals`,
`announce_target_orgs`, `appointments_autofill_defaults`.
Locked down: `setup_initial_admin` (anon-executable, hard-coded password literal).
Unchanged (names/display only): `auto_create_tenant_patient_on_signup`,
`calculate_profitability`, `get_available_phlebotomists_for_slot` ×3,
`get_available_phlebotomists_with_travel`, `get_org_email_log`,
`get_staff_activity_summary`, `handle_new_user`. Views: none.

**Edge functions changed: 36** (+ new `_shared/authz.ts`; repo-only
`get_user_email.sql` updated, not deployed in DB).
All 36: accept-staff-invitation, attach-lab-order-to-appointment,
attach-lab-order-to-request, backfill-phleb-underpayments, backfill-provider-phone-auth,
cancel-lab-request, claim-provider-portal, complete-provider-onboarding, corporate-customer-portal,
corporate-invite-employee, corporate-seat-update, create-lab-request,
create-org-subscription-checkout, create-provider-plan-checkout,
create-staff-invitation, create-stripe-portal-session, generate-appointment-pay-token,
get-admin-analytics, ghs-webhook, insurance-self-upload, invite-org-manager,
invite-team-member, provider-dashboard-data, provider-plan-manage,
reconcile-phantom-payments, reconcile-phleb-payouts-from-stripe, request-provider-claim,
resend-lab-request, send-manual-invoice-reminder, send-membership-offer, send-org-welcome, sign-baa,
stripe-payout-diagnostic, sweep-phleb-owed-payouts, training-ask-nico, training-search.
Of these, writers now setting app_metadata (8): accept-staff-invitation, backfill-provider-phone-auth,
claim-provider-portal, create-provider-plan-checkout, invite-org-manager,
invite-team-member, request-provider-claim, send-org-welcome
(invite-patient relies on the signup trigger → `patient`).

**Frontend files changed: 15** (+ new `src/lib/authRole.ts`): useAuthSession,
RoleProtectedRoute, Dashboard, ProviderDashboard, Login, ResetPassword,
ProviderPatientRecordPage, useEmailVerification, auth-tokens, errorLogger,
MarketingTab, PatientProfileTab, PatientsSection, useSuperAdminAuth,
superAdminLogin.
Client-side role writers removed: `useSuperAdminAuth` / `superAdminLogin`
(`updateUser({data:{role:'super_admin'}})`), `Dashboard` (`role:'provider'`).
Self-signup role claims left in place (now harmless, trigger decides):
`useSignup` (patient/concierge_doctor), `usePhlebotomistSignup` (phlebotomist →
becomes `patient`), `TenantSignupForm` (office_manager → `patient`, page not routed),
`DemoPatient`, onboarding. `StaffManagementTab` calls `auth.admin.createUser` from the
browser (cannot work with the anon key) — left as-is, see follow-ups.

## Backfill decisions (dry run, read-only, 2026-10-02)

| decision | assigned role | users |
|---|---|---|
| copied_nonprivileged | patient | 410 |
| org_staff | provider (+org) | 52 |
| defaulted (no role) | patient | 39 |
| verified_privileged (in user_roles) | phlebotomist | 7 |
| verified_privileged (in user_roles) | super_admin | 5 |
| org_staff | office_manager (+org) | 2 |
| copied_nonprivileged | concierge_doctor / user | 1 / 1 |
| downgraded_* | — | **0** |

**Owner review before step 1** (privileged/org claims that cannot be fully
corroborated):
* `hickmannaquala6@gmail.com` — super_admin in both metadata and `user_roles`
  (also office_manager in user_roles). Confirm intended.
* Providers whose email is not a contact/manager/front-desk email of their org
  (self-registered, not invited) — kept as provider:
  `ldoyle@eclusivehealthretreats.info` (Exclusive Health Retreats),
  `richardedwardsdo@gmail.com` (Elite Medical Concierge),
  `schedule@trpclinic.com` (The Restoration Place).
* `admin@convelabs.com` — `setup_initial_admin()` contains a password literal for
  this account; rotate its password if it was ever left at that value.

## Rollout (ordered)

0. **Pre-flight (read-only).** Save current definitions for rollback:
   ```sql
   select schemaname, tablename, policyname, cmd, roles, qual, with_check
     from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~* 'user_metadata|raw_user_meta';
   select p.oid::regprocedure, pg_get_functiondef(p.oid) from pg_proc p
     where p.oid in ('public.check_patient_cross_org_collision(text,text,uuid)'::regprocedure,
       'public.get_org_linked_patients()'::regprocedure, 'public.get_org_linked_patients_logged()'::regprocedure,
       'public.get_org_roi(uuid)'::regprocedure, 'public.get_patients_for_org_admin(uuid)'::regprocedure,
       'public.list_org_staff_admin(uuid)'::regprocedure, 'public.enforce_phleb_compliance()'::regprocedure,
       'public.resync_appointment_card_totals(date,boolean)'::regprocedure,
       'public.announce_target_orgs()'::regprocedure, 'public.appointments_autofill_defaults()'::regprocedure);
   ```
   Do the owner review above. Confirm prod bundle matches `main` (CLAUDE.md).
1. **Apply phase 1** (`20261002130000_roles_to_app_metadata.sql`). Verify with
   queries V1–V3 below. Nothing user-visible changes.
2. **Deploy the 36 edge functions** (commit is on the branch; deploy with each
   function's existing flags, e.g. `npx supabase functions deploy <name> --no-verify-jwt
   --project-ref yluyonhrxxtyuiyrdixl` for public ones). Check `get_logs`
   (edge-function) for BOOT_ERROR/5xx. They read the live row, so staff keep
   access immediately. Must come **after** step 1 (before it, app_metadata is
   empty and every staff check would 403).
   Deploy with the **live** verify_jwt setting (from `list_edge_functions`,
   2026-10-02; several differ from config.toml):
   * `--no-verify-jwt` (verify_jwt=false): accept-staff-invitation,
     backfill-phleb-underpayments, backfill-provider-phone-auth,
     complete-provider-onboarding, corporate-customer-portal,
     corporate-invite-employee, corporate-seat-update, create-staff-invitation,
     get-admin-analytics, ghs-webhook, insurance-self-upload,
     reconcile-phantom-payments, send-org-welcome, sign-baa,
     stripe-payout-diagnostic, sweep-phleb-owed-payouts.
   * verify_jwt=true (no flag): attach-lab-order-to-appointment,
     attach-lab-order-to-request, cancel-lab-request, claim-provider-portal,
     create-lab-request, create-org-subscription-checkout,
     create-provider-plan-checkout, create-stripe-portal-session,
     generate-appointment-pay-token, invite-org-manager, invite-team-member,
     provider-dashboard-data, provider-plan-manage,
     reconcile-phleb-payouts-from-stripe, request-provider-claim,
     resend-lab-request, send-manual-invoice-reminder, send-membership-offer,
     training-ask-nico, training-search.
3. **Apply phase 2** (`…_enforce.sql`). Stale tokens fall back to the live row via
   the helpers — no forced sign-out. Run V4 (persona matrix) and V5 (attack).
   The forged-claims persona must now see 0 rows.
4. **Frontend:** push branch → PR → owner merges to `main` → Vercel builds
   (never CLI). Verify the live bundle hash changed. (The SPA works with or
   without phase 2; it can also ship before step 3.)
5. **After ≥ 24h:** optionally set `allowLegacyFallback=false` in
   `src/lib/authRole.ts` and remove it; spot-check `role_migration_audit`.
   Keep `user_metadata.role` for display/back-compat; it is no longer trusted.

Rollback: phase 2 → re-apply the step-0 definitions. Phase 1 →
`update auth.users u set raw_app_meta_data = a.prior_app_metadata from public.role_migration_audit a where a.user_id = u.id;`
then drop the trigger (see migration footer). Edge functions → redeploy previous
commit. Note: phase 1 rollback discards app_metadata written after the backfill.

## Verification queries

All read-only. Run as `postgres` in the SQL editor / MCP `execute_sql`.

**V1 — every user has a trusted role; distribution matches the dry run**
```sql
select raw_app_meta_data->>'role' role, count(*),
       count(*) filter (where raw_app_meta_data ? 'organization_id') with_org
from auth.users group by 1 order by 2 desc;
-- expect: patient 449, provider 52 (52 org), phlebotomist 7, super_admin 5,
--         office_manager 2 (2 org), concierge_doctor 1, user 1; no NULL row.
```

**V2 — audit decisions / anything downgraded**
```sql
select decision, assigned_role, count(*) from public.role_migration_audit group by 1,2 order by 3 desc;
select email, legacy_role, legacy_org, assigned_role, decision from public.role_migration_audit
 where decision like 'downgraded%';   -- expect 0 rows
```

**V3 — trigger + helpers exist, no policy still reads user_metadata (after phase 2)**
```sql
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'trg_default_app_role_on_signup';
select count(*) from pg_policies
 where coalesce(qual,'')||coalesce(with_check,'') ~* 'user_metadata|raw_user_meta';  -- 59 before phase 2, 0 after
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ~ $$(user_metadata|raw_user_meta_data)[^,]{0,6}'(role|organization_id|org_id)'$$;
-- after phase 2 expect only: auto_create_tenant_patient_on_signup (non-authz, intentional)
```

**V4 — persona matrix (before vs after).** Template; substitute a user id. The
claims are built from the user's live row, exactly like a fresh token.
```sql
begin read only;
select set_config('request.jwt.claims', json_build_object(
  'sub', u.id, 'role', 'authenticated',
  'app_metadata', u.raw_app_meta_data, 'user_metadata', u.raw_user_meta_data)::text, true)
from auth.users u where u.id = '<USER_ID>';
set local role authenticated;
select (select count(*) from public.appointments)          appts,
       (select count(*) from public.tenant_patients)       patients,
       (select count(*) from public.patient_lab_requests)  lab_requests,
       (select count(*) from public.organizations)         orgs,
       (select count(*) from public.org_invoices)          invoices,
       (select count(*) from public.specimen_deliveries)   specimens,
       (select count(*) from public.sms_notifications)     sms,
       (select count(*) from public.webhook_logs)          webhook_logs,
       (select count(*) from public.patient_insurances)    insurances;
rollback;
```
Personas (ids from 2026-10-02): super_admin `6ac7baf5-7f1a-4c88-9be7-c8c7fb00e71e`;
partner office_manager `8309ac21-1607-44f9-b4c0-9b423c3dbf4b` (Littleton);
provider `6e592568-8d2e-4bc1-bd94-b5199ab3598c`;
phlebotomist `91c76708-8c5b-4068-92c6-323805a3b164`;
patient `b7f00f1c-1ef2-46ec-98ec-9787ffb12413`.
Expected: identical numbers before and after for every honest persona.
(`storage.objects` and the 19 legacy tables error before phase 2 — see inventory —
so test them only after: e.g. `select count(*) from storage.objects where bucket_id='insurance-cards'`.)

**V5 — the attack is closed (run after phase 2)**
```sql
begin read only;
select set_config('request.jwt.claims', json_build_object(
  'sub', 'b7f00f1c-1ef2-46ec-98ec-9787ffb12413', 'role', 'authenticated',
  'app_metadata',  json_build_object('provider','email','role','patient'),
  'user_metadata', json_build_object('role','super_admin',
                                     'organization_id','a641125b-3343-43a3-9a17-ce47754e6ec8'))::text, true);
set local role authenticated;
select (select count(*) from public.appointments) appts, (select count(*) from public.tenant_patients) patients,
       (select count(*) from public.patient_lab_requests) lab_requests, (select count(*) from public.org_invoices) invoices;
rollback;
-- before phase 2: 523 / 761 / … ; after: 0 / 0 / 0 / 0 (or only the patient's own rows)
```
Also repeat V5 with `app_metadata` **omitted** (stale pre-backfill token) — the
helpers must fall back to the live row (`patient`) and still return 0.

**Expected access by role (unchanged for honest users; source changes only)**

| trusted role | via the rewritten policies |
|---|---|
| super_admin / admin / owner | appointments ALL; organizations ALL; org_invoices ALL; tenant_patients read/update/delete; specimen_deliveries read/insert/update; sms_notifications, post_visit_sequences, referral_codes/credits ALL; webhook_logs read; insurance-cards read/delete; staff-onboarding read |
| office_manager / provider **with org** | own-org appointments (read/update), tenant_patients (read/update), lab requests, specimens, invoices, own organization row, patient addresses/insurances, appointment_lab_orders (view/upload); tenant_patients insert (any org — pre-existing); insurance-cards read (all — pre-existing) |
| office_manager (any) | + membership_offers_sent, provider_outreach_log, service_package_items, services_enhanced |
| phlebotomist | organizations read, org_providers read, specimen insert, insurance-cards read |
| patient / concierge_doctor / user | none of these policies (own-row policies elsewhere unaffected) |
| internal staff in `user_roles` | the 19 legacy admin tables (currently erroring) per their role lists |
| anyone forging `user_metadata` | **nothing** (was: everything above) |

## Risks / follow-ups (not fixed here)

1. **`office_manager` is overloaded.** Partner-clinic staff (Aristotle, Littleton)
   carry the same role name as an internal ops manager. This migration preserves
   today's grants, so those 2 partner accounts keep: all insurance-card images,
   `provider_outreach_log`, `services_enhanced`/`service_package_items` write,
   `membership_offers_sent`, `tenant_patients` insert, and — in edge functions —
   `sweep-phleb-owed-payouts`, `reconcile-phleb-payouts-from-stripe`,
   `reconcile-phantom-payments`, `stripe-payout-diagnostic`,
   `send-manual-invoice-reminder`, `training-*`, `corporate-*`,
   `resync_appointment_card_totals`. Recommend a distinct partner role (e.g.
   `org_manager`) or requiring `jwt_org_id() is null` for internal-only grants.
2. `provider`/`office_manager` can read **every** insurance-card object (storage
   policy has no org scope) — pre-existing.
3. The 19 legacy policies + `storage.objects` start evaluating after phase 2
   (today they raise). Watch for client code paths that suddenly succeed.
4. Phleb self-signup (`/phlebotomist-signup`) now yields `patient`; phleb access
   must come from `create-staff-invitation` → `accept-staff-invitation`.
5. `StaffManagementTab` uses `supabase.auth.admin.createUser` in the browser
   (anon key → fails). Route through an edge function that sets app_metadata.
6. Roles in a still-valid JWT persist until refresh (≤1h) after a demotion —
   standard Supabase behaviour; the DB fallback only applies when the claim is absent.
7. `get_patients_for_org_admin` gates on `get_current_user_role()` (user_roles),
   so partner staff (not in user_roles) get `unauthorized` — pre-existing.
