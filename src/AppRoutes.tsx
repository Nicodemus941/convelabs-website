import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ConversionOptimizationProvider } from './contexts/ConversionOptimizationContext';
import { TenantProvider } from './contexts/tenant/TenantContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { BookingModalProvider } from './contexts/BookingModalContext';
import { HelmetProvider } from 'react-helmet-async';

// Import route files (they now use lazy-loaded components internally)
import { routes as publicRoutes } from './routes/PublicRoutes';
import { routes as onboardingRoutes } from './routes/OnboardingRoutes';
import { routes as serviceRoutes } from './routes/ServiceRoutes';
import { routes as membershipRoutes } from './routes/MembershipRoutes';
import { routes as protectedRoutes } from './routes/ProtectedRoutes';
import { routes as salesFunnelRoutes } from './routes/SalesFunnelRoutes';

// Lazy load standalone pages used directly in AppRoutes
const BookAppointment = lazy(() => import('./pages/BookAppointment'));
const SuperAdminSetupPage = lazy(() => import('./pages/SuperAdminSetupPage'));

import { ScrollToTop } from './components/utils/ScrollToTop';

// Lightweight loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const AppRoutes = () => {
  useEffect(() => {
    console.log('AppRoutes component mounted');
    
    const originalReplaceState = window.history.replaceState;
    let replaceStateCount = 0;
    let lastResetTime = Date.now();
    
    window.history.replaceState = function(...args) {
      const currentTime = Date.now();
      if (currentTime - lastResetTime > 10000) {
        replaceStateCount = 0;
        lastResetTime = currentTime;
      }
      
      replaceStateCount++;
      if (replaceStateCount > 90) {
        console.warn(`Warning: replaceState called ${replaceStateCount} times in 10 seconds`);
      }
      
      return originalReplaceState.apply(this, args);
    };
    
    return () => {
      window.history.replaceState = originalReplaceState;
    };
  }, []);
  
  return (
    <Router>
      <ScrollToTop />
      <HelmetProvider>
        <AuthProvider>
          <ConversionOptimizationProvider>
            <BookingModalProvider>
            <TenantProvider>
              <NotificationsProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  {publicRoutes}
                  {onboardingRoutes}
                  {serviceRoutes}
                  {membershipRoutes}
                  {protectedRoutes}
                  {salesFunnelRoutes}
                  
                  <Route path="/book" element={<BookAppointment />} />
                  <Route path="/book/:tenantId" element={<BookAppointment />} />
                  <Route path="/setup-super-admin" element={<SuperAdminSetupPage />} />
                  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </NotificationsProvider>
            </TenantProvider>
            </BookingModalProvider>
          </ConversionOptimizationProvider>
        </AuthProvider>
      </HelmetProvider>
    </Router>
  );
};

export default AppRoutes;
