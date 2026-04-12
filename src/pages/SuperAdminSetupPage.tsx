
import React from 'react';
import { Helmet } from 'react-helmet-async';
import SuperAdminSetup from '@/components/admin/SuperAdminSetup';
import DashboardWrapper from '@/components/dashboards/DashboardWrapper';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const SuperAdminSetupPage = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If already super admin, redirect to dashboard
  if (user.role === 'super_admin') {
    return <Navigate to="/dashboard/super_admin" replace />;
  }

  return (
    <DashboardWrapper>
      <Helmet>
        <title>Setup Super Admin Access - ConveLabs</title>
      </Helmet>
      
      <div className="container mx-auto py-12">
        <SuperAdminSetup />
      </div>
    </DashboardWrapper>
  );
};

export default SuperAdminSetupPage;
