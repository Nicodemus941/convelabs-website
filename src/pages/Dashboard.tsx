
import React, { useEffect } from "react";
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom";
import { UserRole } from "@/types/auth";
import DashboardWrapper from "@/components/dashboards/DashboardWrapper";
import SuperAdminDashboard from "@/components/dashboards/SuperAdminDashboard";
import PatientDashboard from "@/components/dashboards/PatientDashboard";
import PhlebotomistDashboard from "@/components/dashboards/PhlebotomistDashboard";
import OfficeManagerDashboard from "@/components/dashboards/OfficeManagerDashboard";
import ConciergeDoctorDashboard from "@/components/dashboards/ConciergeDoctorDashboard";
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

const Dashboard = () => {
  const { "*": urlPath } = useParams<{ "*": string }>();
  const location = useLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Parse the URL path to extract role and adminTab - use location.pathname as fallback
  const actualPath = urlPath || location.pathname.replace('/dashboard/', '');
  const pathParts = actualPath?.split('/').filter(Boolean) || [];
  const role = pathParts[0];
  const adminTab = pathParts[1];
  
  console.log("Dashboard component rendering with:", { role, adminTab, urlPath, actualPath, pathParts, pathname: location.pathname, user });
  
  // If no role parameter but user exists, redirect to role-specific dashboard
  useEffect(() => {
    if (!role && user) {
      console.log("No role parameter found, redirecting to user role dashboard");
      navigate(`/dashboard/${user.role}`, { replace: true });
    }
  }, [role, user, navigate]);
  
  // If no user, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Convert string parameter to UserRole type, fallback to user role if param not provided
  const userRole = (role || user.role) as UserRole;
  
  // Check if this is an admin tab route
  if (userRole === "super_admin" && adminTab) {
    console.log("Rendering admin tab:", adminTab, "Available tabs:", ["users", "staff", "services", "inventory", "appointments", "documentation", "settings", "marketing"]);
    // Handle admin tabs
    return (
      <RoleProtectedRoute allowedRoles={["super_admin", "admin"]}>
        <DashboardWrapper>
          {adminTab === "users" && <UserManagementTab />}
          {adminTab === "staff" && <StaffManagementTab />}
          {adminTab === "services" && <AdminServicesTab />}
          {adminTab === "inventory" && <InventoryTab />}
          {adminTab === "appointments" && <EnhancedAppointmentsTab />}
          {adminTab === "documentation" && <DocumentationTab />}
          {adminTab === "settings" && <SettingsTab />}
          {adminTab === "marketing" && <MarketingTab />}
          {adminTab === "webhooks" && <WebhookEventMonitor />}
          {!["users", "staff", "services", "inventory", "appointments", "documentation", "settings", "marketing", "webhooks"].includes(adminTab) && (
            <Navigate to="/dashboard/super_admin" replace />
          )}
        </DashboardWrapper>
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
            <SuperAdminDashboard />
          </RoleProtectedRoute>
        );
      case "office_manager":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "office_manager"]}>
            <OfficeManagerDashboard />
          </RoleProtectedRoute>
        );
      case "phlebotomist":
        return (
          <RoleProtectedRoute allowedRoles={["super_admin", "office_manager", "phlebotomist"]}>
            <PhlebotomistDashboard />
          </RoleProtectedRoute>
        );
      case "patient":
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
      default:
        // If no role is provided or invalid role, check user role
        console.log("No valid role found, defaulting to user role:", user.role);
        return <Navigate to={`/dashboard/${user.role}`} replace />;
    }
  };

  return (
    <DashboardWrapper>
      {renderDashboard()}
    </DashboardWrapper>
  );
};

export default Dashboard;
