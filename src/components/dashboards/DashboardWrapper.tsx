
import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/home/Footer";
import Header from "@/components/home/Header";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PageTransition } from "@/components/ui/page-transition";

type DashboardWrapperProps = {
  children: React.ReactNode;
  requireAuth?: boolean;
};

const DashboardWrapper = ({ children, requireAuth = false }: DashboardWrapperProps) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // Notify user when they're redirected to login
  useEffect(() => {
    if (!isLoading && requireAuth && !user) {
      toast.info("Please log in to access this page", {
        id: "login-required",
        duration: 3000,
      });
    }
  }, [isLoading, requireAuth, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <div className="container mx-auto py-8 px-4">
            <div className="max-w-7xl mx-auto">
              <Skeleton className="h-10 w-1/4 mb-6" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
              <div className="mt-8">
                <Skeleton className="h-4 w-3/4 mb-3" />
                <Skeleton className="h-4 w-2/3 mb-3" />
                <Skeleton className="h-4 w-5/6 mb-3" />
              </div>
            </div>
          </div>
        </main>
        <Footer variant="slim" />
      </div>
    );
  }

  if (requireAuth && !user) {
    // Prevent redirect loops by checking if we're already going to /login
    if (location.pathname.includes('/login')) {
      return <Navigate to="/login" replace />;
    }
    
    // Include the full pathname in the redirect URL for a better user experience
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <PageTransition>
          {children}
        </PageTransition>
      </main>
      <Footer variant="slim" />
    </div>
  );
};

export default DashboardWrapper;
