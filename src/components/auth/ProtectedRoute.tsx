
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthSession } from '@/hooks/useAuthSession';
import { Skeleton } from "@/components/ui/skeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectPath?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children,
  redirectPath = "/login"
}) => {
  const { session, isLoading } = useAuthSession();
  
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
    // Redirect to login if not authenticated with the current path as a redirect parameter
    return <Navigate to={`${redirectPath}?redirect=${window.location.pathname}`} replace />;
  }

  // User is authenticated, render the protected content
  return <>{children}</>;
};

export default ProtectedRoute;
