import React, { lazy } from 'react';
import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import RoleProtectedRoute from '../components/auth/RoleProtectedRoute';

const UserProfile = lazy(() => import('../pages/UserProfile'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Appointments = lazy(() => import('../pages/Appointments'));

const MarketingCampaigns = lazy(() => import('../pages/admin/MarketingCampaigns'));
const MarketingAnalytics = lazy(() => import('../pages/admin/MarketingAnalytics'));
const ScheduledCampaigns = lazy(() => import('../pages/admin/ScheduledCampaigns'));

const TenantOnboarding = lazy(() => import('../pages/TenantOnboarding'));
const TenantDashboard = lazy(() => import('../pages/tenant/Dashboard'));
const TenantBookAppointment = lazy(() => import('../pages/TenantBookAppointment'));
const BookAppointment = lazy(() => import('../pages/BookAppointment'));
const PhlebotomistApp = lazy(() => import('../pages/PhlebotomistApp'));

export const routes = [
  <Route key="profile" path="/profile" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />,
  <Route key="dashboard" path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />,
  <Route key="dashboard-role" path="/dashboard/:role" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />,
  <Route key="dashboard-role-admin-tab" path="/dashboard/:role/:adminTab" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />,
  <Route key="my-appointments" path="/my-appointments" element={<ProtectedRoute><Appointments /></ProtectedRoute>} />,
  <Route key="tenant-onboarding" path="/tenant/onboarding" element={<ProtectedRoute><TenantOnboarding /></ProtectedRoute>} />,
  <Route key="tenant-dashboard" path="/tenant/dashboard/:tenantId" element={<ProtectedRoute><TenantDashboard /></ProtectedRoute>} />,
  <Route key="tenant-dashboard-tab" path="/tenant/dashboard/:tenantId/:tab" element={<ProtectedRoute><TenantDashboard /></ProtectedRoute>} />,
  <Route key="tenant-book" path="/tenant/book/:tenantId" element={<ProtectedRoute><TenantBookAppointment /></ProtectedRoute>} />,
  <Route key="tenant-booking" path="/tenant/booking/:tenantId" element={<ProtectedRoute><BookAppointment /></ProtectedRoute>} />,
  <Route key="book-tenant" path="/book/:tenantId" element={<BookAppointment />} />,
  <Route key="admin-marketing-campaigns" path="/admin/marketing/campaigns" element={<RoleProtectedRoute allowedRoles={['admin', 'office_manager', 'super_admin']}><MarketingCampaigns /></RoleProtectedRoute>} />,
  <Route key="admin-marketing-scheduled" path="/admin/marketing/scheduled" element={<RoleProtectedRoute allowedRoles={['admin', 'office_manager', 'super_admin']}><ScheduledCampaigns /></RoleProtectedRoute>} />,
  <Route key="admin-marketing-analytics" path="/admin/marketing/analytics" element={<RoleProtectedRoute allowedRoles={['admin', 'office_manager', 'super_admin']}><MarketingAnalytics /></RoleProtectedRoute>} />,
  <Route key="phleb-app" path="/phleb-app" element={<ProtectedRoute><PhlebotomistApp /></ProtectedRoute>} />,
];

export const ProtectedRoutes = () => null;
