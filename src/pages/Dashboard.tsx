
import React, { useEffect } from "react";
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { UserRole } from "@/types/auth";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import SuperAdminDashboard from "@/components/dashboards/SuperAdminDashboard";
import PatientDashboard from "@/components/dashboards/PatientDashboard";
import PhlebotomistDashboard from "@/components/dashboards/PhlebotomistDashboard";
import OfficeManagerDashboard from "@/components/dashboards/OfficeManagerDashboard";
import ConciergeDoctorDashboard from "@/components/dashboards/ConciergeDoctorDashboard";
import ProviderDashboard from "@/components/dashboards/ProviderDashboard";
import { supabase } from "@/integrations/supabase/client";
import RoleProtectedRoute from "@/components/auth/RoleProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import UserManagementTab from "@/components/dashboards/admin/UserManagementTab";
import StaffManagement from "@/components/dashboards/admin/staff/StaffManagement";
import InventoryTab from "@/components/dashboards/admin/InventoryTab";
import AdminServicesTab from "@/components/admin/AdminServicesTab";
import EnhancedAppointmentsTab from "@/components/dashboards/admin/enhanced/EnhancedAppointmentsTab";
import DocumentationTab from "@/components/dashboards/admin/DocumentationTab";
import SettingsTab from "@/components/dashboards/admin/SettingsTab";
import MarketingTab from "@/components/dashboards/admin/MarketingTab";
import StaffManagementTab from "@/components/dashboards/admin/StaffManagementTab";
import WebhookEventMonitor from "@/components/dashboards/admin/WebhookEventMonitor";
import AdminCalendar from "@/components/calendar/AdminCalendar";
import SMSMessagingTab from "@/components/dashboards/admin/SMSMessagingTab";
import InvoicesTab from "@/components/dashboards/admin/InvoicesTab";
import SpecimenTrackingTab from "@/components/dashboards/admin/SpecimenTrackingTab";
import NotesTab from "@/components/dashboards/admin/NotesTab";
import InboxTab from "@/components/dashboards/admin/InboxTab";
import PatientProfileTab from "@/components/dashboards/admin/PatientProfileTab";
// Lazy-load the Lab Orders tab — large component (drawer + grouped view +
// auto-fulfill UI). Most admin sessions never open this tab, so deferring
// it speeds up first paint for every other admin route.
//
// Wrapped in lazyWithRetry so stale-bundle deploys never strand an admin
// on a blank tab (Naquala hit this 2026-05-12 — old index.html referenced
// LabOrdersTab-DCdZ9xfX.js after a new deploy replaced the chunk hash).
// First failure triggers a one-time hard reload; second failure surfaces
// to ErrorBoundary so the admin gets an actionable error instead of a
// silent blank page.
import { lazyWithRetry } from "@/lib/lazyWithRetry";
const LabOrdersTab = lazyWithRetry(() => import("@/components/dashboards/admin/LabOrdersTab"), 'LabOrdersTab');
const NewUpdatesTab = lazyWithRetry(() => import("@/components/dashboards/admin/NewUpdatesTab"), 'NewUpdatesTab');
import OrganizationsTab from "@/components/dashboards/admin/OrganizationsTab";
import OperationsPanel from "@/components/dashboards/admin/OperationsPanel";
import AIOpsAssistant from "@/components/dashboards/admin/AIOpsAssistant";
import HormoziDashboard from "@/components/dashboards/admin/hormozi/HormoziDashboard";
import UpgradesTab from "@/components/dashboards/admin/UpgradesTab";
import TrainingTab from "@/components/dashboards/admin/TrainingTab";
import ChatbotTab from "@/components/dashboards/admin/ChatbotTab";
import ProviderAcquisitionTab from "@/components/dashboards/admin/ProviderAcquisitionTab";
import ScriptsTab from "@/components/dashboards/admin/ScriptsTab";
import AdminLayout from "@/components/dashboards/admin/AdminLayout";

const Dashboard = () => {
  const { "*": urlPath } = useParams<{ "*": string }>();
  const location = useLocation();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  // Raw Supabase user metadata — useAuth().user is mapped through
  // useAuthSession.mapUserData and does NOT expose user_metadata. We need
  // raw metadata (organization_id, role_label) to detect partner-org staff
  // like Lara/Dianelis. Without this, partner staff fell through to the
  // internal ConveLabs admin dashboard. Bug shipped 2026-05-07.
  const [rawMeta, setRawMeta] = React.useState<Record<string, any> | null>(null);
  useEffect(() => {
    if (!user) { setRawMeta(null); return; }
    let cancel = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancel) setRawMeta((data?.user?.user_metadata as any) || {});
    }).catch(() => { if (!cancel) setRawMeta({}); });
    return () => { cancel = true; };
  }, [user]);

  // Parse the URL path to extract role and adminTab - use location.pathname as fallback
  const actualPath = urlPath || location.pathname.replace('/dashboard/', '');
  const pathParts = actualPath?.split('/').filter(Boolean) || [];
  const role = pathParts[0];
  const adminTab = pathParts[1];

  // Redirect to role-specific dashboard. Deterministic role derivation:
  //   1. If user.role is already set, use it
  //   2. Otherwise, check if their email matches a portal_enabled active org
  //      (single source of truth — if they're a portal contact, they're a provider)
  //   3. Only if neither: default to patient
  //
  // This prevents the "org-contact landed on patient dashboard" bug — the role
  // is derived from actual data, not from whatever default was stamped at signup.
  useEffect(() => {
    if (role || !user) return;

    (async () => {
      if (user.role) {
        navigate(`/dashboard/${user.role}`, { replace: true });
        return;
      }
      // No role in metadata — check org membership
      if (user.email) {
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .or(`billing_email.eq.${user.email},contact_email.eq.${user.email}`)
          .eq('portal_enabled', true)
          .eq('is_active', true)
          .maybeSingle();
        if (org) {
          // Stamp the role on the auth user so future logins skip this branch
          try {
            await supabase.auth.updateUser({ data: { role: 'provider' } });
          } catch { /* non-blocking */ }
          navigate('/dashboard/provider', { replace: true });
          return;
        }
      }
      // No role, not an org contact — default to patient
      navigate('/dashboard/patient', { replace: true });
    })();
  }, [role, user, navigate]);

  // Wait for auth to finish loading before redirecting
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#B91C1C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // If no user after loading, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Convert string parameter to UserRole type, fallback to user role if param not provided
  const userRole = (role || user.role) as UserRole;

  // Partner-org staff detection — Lara at Littleton, Dianelis at Aristotle, etc.
  // The `office_manager` role label is overloaded:
  //   - Internal ConveLabs ops manager → no organization_id → uses OfficeManagerDashboard (admin sidebar)
  //   - External partner-org staff → has organization_id in metadata → must use ProviderDashboard
  // Reads from rawMeta (fetched via supabase.auth.getUser) because useAuth().user
  // strips user_metadata in the mapping layer.
  if (rawMeta === null) {
    // Still loading metadata — show spinner instead of flashing the wrong dashboard
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#B91C1C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  const partnerOrgId = rawMeta.organization_id || rawMeta.org_id || null;
  const isPartnerOrgStaff = !!partnerOrgId && (userRole === "office_manager" || userRole === "provider");

  if (isPartnerOrgStaff) {
    return (
      <RoleProtectedRoute allowedRoles={["super_admin", "office_manager", "provider"]}>
        <ProviderDashboard />
      </RoleProtectedRoute>
    );
  }

  // Check if this is an admin tab route (super_admin OR internal office_manager)
  if ((userRole === "super_admin" || userRole === "office_manager") && adminTab) {
    // Owner-only tabs — visible to the platform owner alone, hidden from
    // operational super_admins (e.g. Naquala). UI sidebar already filters
    // these out via ownerOnly flag; this is the URL-typing guard.
    const OWNER_ONLY_TABS = new Set(["hormozi", "upgrades"]);
    const PLATFORM_OWNER_EMAIL = "nicodemmebaptiste@convelabs.com";
    const isPlatformOwner = (user.email || "").toLowerCase() === PLATFORM_OWNER_EMAIL.toLowerCase();
    if (OWNER_ONLY_TABS.has(adminTab) && !isPlatformOwner) {
      return <Navigate to={`/dashboard/${userRole}`} replace />;
    }
    return (
      <RoleProtectedRoute allowedRoles={["super_admin", "office_manager"]}>
        <AdminLayout>
          {adminTab === "users" && <UserManagementTab />}
          {adminTab === "staff" && <StaffManagementTab />}
          {adminTab === "services" && <AdminServicesTab />}
          {adminTab === "inventory" && <InventoryTab />}
          {adminTab === "appointments" && <EnhancedAppointmentsTab />}
          {adminTab === "documentation" && <DocumentationTab />}
          {adminTab === "settings" && <SettingsTab />}
          {adminTab === "marketing" && <MarketingTab />}
          {adminTab === "webhooks" && <WebhookEventMonitor />}
          {adminTab === "calendar" && <AdminCalendar />}
          {adminTab === "sms" && <SMSMessagingTab />}
          {adminTab === "invoices" && <InvoicesTab />}
          {adminTab === "specimens" && <SpecimenTrackingTab />}
          {adminTab === "notes" && <NotesTab />}
          {adminTab === "inbox" && <InboxTab />}
          {adminTab === "patients" && <PatientProfileTab />}
          {adminTab === "lab-orders" && (
            <React.Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading lab orders…</div>}>
              <LabOrdersTab />
            </React.Suspense>
          )}
          {adminTab === "new-updates" && (
            <React.Suspense fallback={<div className="p-8 text-center text-sm text-gray-500">Loading what's new…</div>}>
              <NewUpdatesTab />
            </React.Suspense>
          )}
          {adminTab === "organizations" && <OrganizationsTab />}
          {adminTab === "operations" && <OperationsPanel />}
          {adminTab === "ai-assistant" && <AIOpsAssistant />}
          {adminTab === "hormozi" && <HormoziDashboard />}
          {adminTab === "upgrades" && <UpgradesTab />}
          {adminTab === "training" && <TrainingTab />}
          {adminTab === "chatbot" && <ChatbotTab />}
          {adminTab === "provider-acquisition" && <ProviderAcquisitionTab />}
          {adminTab === "scripts" && <ScriptsTab />}
          {!["users", "staff", "services", "inventory", "appointments", "documentation", "settings", "marketing", "webhooks", "calendar", "sms", "invoices", "specimens", "notes", "inbox", "patients", "lab-orders", "new-updates", "organizations", "operations", "ai-assistant", "hormozi", "upgrades", "training", "chatbot", "provider-acquisition", "scripts"].includes(adminTab) && (
            <Navigate to={`/dashboard/${userRole}`} replace />
          )}
        </AdminLayout>
      </RoleProtectedRoute>
    );
  }
  
  // Determine which dashboard to render based on role
  const renderDashboard = () => {
    console.log("Rendering dashboard for role:", userRole);
    switch (userRole) {
      case "super_admin":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin"]}>
            <AdminLayout>
              <SuperAdminDashboard />
            </AdminLayout>
          </RoleProtectedRoute>
        );
      case "office_manager":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "office_manager"]}>
            <AdminLayout>
              <OfficeManagerDashboard />
            </AdminLayout>
          </RoleProtectedRoute>
        );
      case "phlebotomist":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "office_manager", "phlebotomist"]}>
            <PhlebotomistDashboard />
          </RoleProtectedRoute>
        );
      case "patient":
        // Patient dashboard route gate.
        // ROLE allowlist below is permissive on PURPOSE — the actual PHI
        // protection happens via RLS on tables (appointments, lab_results,
        // tenant_patients) which scope every read to the auth.uid() of the
        // patient. office_manager / super_admin retain access for legitimate
        // support workflows (verifying a patient's membership tier on a call,
        // re-sending a booking link, etc.) but RLS still bars them from
        // seeing patients outside their org.
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "office_manager", "patient"]}>
            <PatientDashboard />
          </RoleProtectedRoute>
        );
      case "concierge_doctor":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "concierge_doctor"]}>
            <ConciergeDoctorDashboard />
          </RoleProtectedRoute>
        );
      case "provider":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "provider", "office_manager"]}>
            <ProviderDashboard />
          </RoleProtectedRoute>
        );
      default:
        // If no role is provided or invalid role, check user role
        console.log("No valid role found, defaulting to user role:", user.role);
        return <Navigate to={`/dashboard/${user.role}`} replace />;
    }
  };

  // Phlebotomist gets a full-screen PWA experience — no Header/Footer wrapper
  if (userRole === "phlebotomist") {
    return (
      <RoleProtectedRoute allowedRoles={["super_admin", "office_manager", "phlebotomist"]}>
        <PhlebotomistDashboard />
      </RoleProtectedRoute>
    );
  }

  // Provider portal has its own branded header — no DashboardWrapper
  if (userRole === "provider") {
    return renderDashboard();
  }

  // Admin roles use AdminLayout (sidebar) — skip DashboardWrapper Header/Footer
  if (userRole === "super_admin" || userRole === "office_manager") {
    return renderDashboard();
  }

  return (
    <DashboardWrapper>
      {renderDashboard()}
    </DashboardWrapper>
  );
};

export default Dashboard;
