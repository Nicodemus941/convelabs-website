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
import { NativeLaunchRedirect } from './native/NativeLaunchRedirect';
import { NativeBootSplash } from './native/NativeBootSplash';

// Root crash boundary. Without this, ANY render error in a route unmounts the
// whole React tree → a blank screen (exactly how the native login failure
// showed up: splash, then blank). This keeps the app on screen, shows a Reload,
// AND surfaces the underlying error text so a native-only crash is diagnosable
// instead of silent.
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[RootErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-conve-red text-white p-6 text-center pt-safe pb-safe">
          <h1 className="text-2xl font-bold mb-1">ConveLabs Pro</h1>
          <p className="text-white/85 text-sm mb-4">Something went wrong loading the app.</p>
          <pre className="text-[11px] leading-snug text-white/70 max-w-full overflow-auto whitespace-pre-wrap mb-5 max-h-40">
            {this.state.error.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="bg-white text-conve-red px-5 py-2.5 rounded-xl font-semibold"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
      <NativeLaunchRedirect />
      <NativeBootSplash />
      <HelmetProvider>
        <AuthProvider>
          <ConversionOptimizationProvider>
            <BookingModalProvider>
            <TenantProvider>
              <NotificationsProvider>
              <RootErrorBoundary>
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
              </RootErrorBoundary>
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
