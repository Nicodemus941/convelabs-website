
import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthSession } from '@/hooks/useAuthSession';
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from '@/integrations/supabase/client';
import { loginRouteForTarget } from '@/lib/appTarget';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: string[];
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ 
  children, 
  allowedRoles 
}) => {
  const { session, isLoading, userRole } = useAuthSession();
  const navigate = useNavigate();

  // Target-aware login route: the phleb field app sends unauthenticated users
  // to its own /phleb-login (no marketing chrome); web/patient is unchanged.
  const loginRoute = loginRouteForTarget();

  // Check for valid authentication on mount and redirect if not authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        console.log("No valid session found in RoleProtectedRoute, redirecting to login");
        navigate(loginRoute, { replace: true });
      }
    };

    checkAuth();
  }, [navigate, loginRoute]);
  
  if (isLoading) {
    // Show a better loading state with skeleton UI
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
      </div>
    );
  }
  
  if (!session) {
    // Redirect to login if not authenticated (target-aware: phleb app → /phleb-login)
    return <Navigate to={loginRoute} replace />;
  }
  
  if (!userRole || !allowedRoles.includes(userRole)) {
    // Redirect to dashboard if not authorized for this role
    return <Navigate to="/dashboard" replace />;
  }

  // User is authenticated and has required role, render the protected content
  return <>{children}</>;
};

export default RoleProtectedRoute;
