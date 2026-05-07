
import React from 'react';
import { Helmet } from 'react-helmet-async';
import SuperAdminSetup from '@/components/admin/SuperAdminSetup';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

/**
 * SuperAdminSetupPage — bootstrap window is CLOSED.
 *
 * Originally built to turn the very-first user into a super_admin on a
 * fresh install. Once a real super_admin exists in production, this page
 * becomes a privilege-escalation surface (any signed-in user could land
 * here and self-promote). 2026-05-07 audit fix:
 *   - Non-super-admins now redirect to "/" instead of seeing the setup form
 *   - The underlying setupSuperAdminAccess utility has been disabled
 *     (returns failure without touching auth.users)
 *
 * Future bootstrap: if we ever spin up a fresh tenant and need to promote
 * the first user, do it via a server-side edge fn that verifies zero
 * super_admins exist OR via direct SQL by the platform owner.
 */
const SuperAdminSetupPage = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'super_admin') {
    return <Navigate to="/dashboard/super_admin" replace />;
  }

  // BOOTSTRAP WINDOW CLOSED — anyone reaching this URL who isn't already
  // a super_admin gets redirected to home. No setup form ever rendered.
  return <Navigate to="/" replace />;
};

export default SuperAdminSetupPage;
