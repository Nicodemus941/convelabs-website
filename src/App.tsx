
import React, { Suspense, lazy } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ConversionOptimizationProvider } from '@/contexts/ConversionOptimizationContext';
import { BookingModalProvider } from '@/contexts/BookingModalContext';
import { ConversionAnalytics } from '@/components/conversion/ConversionAnalytics';
import ErrorBoundary from '@/components/ui/error-boundary';
import { TenantProvider } from '@/contexts/tenant/TenantContext';
import Home from '@/pages/Home';

// Lazy-load all non-landing routes to reduce initial bundle
const About = lazy(() => import('@/pages/About'));
const BloodWorkGuide = lazy(() => import('@/pages/BloodWorkGuide'));
const RescheduleResponse = lazy(() => import('@/pages/RescheduleResponse'));
const RescheduleConfirmed = lazy(() => import('@/pages/RescheduleConfirmed').then(m => ({ default: m.RescheduleConfirmed })));
const RescheduleDeclined = lazy(() => import('@/pages/RescheduleConfirmed').then(m => ({ default: m.RescheduleDeclined })));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Appointments = lazy(() => import('@/pages/Appointments'));
const TenantBookAppointment = lazy(() => import('@/pages/TenantBookAppointment'));
const DemoPatient = lazy(() => import('@/pages/DemoPatient'));
const BookAppointment = lazy(() => import('@/pages/BookAppointment'));
const BookNow = lazy(() => import('@/pages/BookNow'));
const Login = lazy(() => import('@/pages/Login'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const Corporate = lazy(() => import('@/pages/Corporate'));
const CorporateBilling = lazy(() => import('@/pages/CorporateBilling'));
const CorporateInviteAccept = lazy(() => import('@/pages/CorporateInviteAccept'));
const AcceptStaffInvite = lazy(() => import('@/pages/AcceptStaffInvite'));
const StaffOnboarding = lazy(() => import('@/pages/StaffOnboarding'));

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <AuthProvider>
            <ConversionOptimizationProvider>
              <BookingModalProvider>
                <TenantProvider>
                  <ConversionAnalytics>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/blood-work-guide" element={<BloodWorkGuide />} />
                        <Route path="/reschedule/confirmed" element={<RescheduleConfirmed />} />
                        <Route path="/reschedule/declined" element={<RescheduleDeclined />} />
                        <Route path="/reschedule/:token" element={<RescheduleResponse />} />
                        <Route path="/dashboard/*" element={<Dashboard />} />
                        <Route path="/appointments" element={<Appointments />} />
                        <Route path="/book" element={<BookAppointment />} />
                        <Route path="/book/:tenantId" element={<BookAppointment />} />
                        <Route path="/book-now" element={<BookNow />} />
                        <Route path="/tenant/:tenantId/book" element={<TenantBookAppointment />} />
                        <Route path="/demo-patient" element={<DemoPatient />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/corporate" element={<Corporate />} />
                        <Route path="/corporate-billing" element={<CorporateBilling />} />
                        <Route path="/corporate-invite/:token" element={<CorporateInviteAccept />} />
                        <Route path="/accept-invite" element={<AcceptStaffInvite />} />
                        <Route path="/onboarding" element={<StaffOnboarding />} />
                      </Routes>
                    </Suspense>
                  </ConversionAnalytics>
                </TenantProvider>
              </BookingModalProvider>
            </ConversionOptimizationProvider>
          </AuthProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  );
}

export default App;
