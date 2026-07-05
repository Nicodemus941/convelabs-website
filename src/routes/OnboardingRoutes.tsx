import React, { lazy } from 'react';
import { Route } from 'react-router-dom';

const AccountCreationPage = lazy(() => import('../pages/onboarding/Account'));
const PlanSelectionPage = lazy(() => import('../pages/onboarding/PlanSelection'));
const PostPaymentPage = lazy(() => import('../pages/onboarding/PostPayment'));
const AgreementsPage = lazy(() => import('../pages/onboarding/Agreements'));
const OnboardingPaymentPage = lazy(() => import('../pages/onboarding/Payment'));
const ConciergeCalculatorPage = lazy(() => import('../pages/onboarding/ConciergeCalculator'));
const OnboardingResumePage = lazy(() => import('../pages/onboarding/Resume'));
const ConciergeDoctorSignup = lazy(() => import('../pages/ConciergeDoctorSignup'));
const ConciergeDoctorOnboarding = lazy(() => import('../pages/ConciergeDoctorOnboarding'));

export const routes = [
  <Route key="onboarding-account" path="/onboarding/account" element={<AccountCreationPage />} />,
  <Route key="onboarding-plan-selection" path="/onboarding/plan-selection" element={<PlanSelectionPage />} />,
  // Previously unregistered — navigations from PlanSelection/PaymentView
  // dead-ended to 404. Now wired so the onboarding flow completes.
  <Route key="onboarding-agreements" path="/onboarding/agreements" element={<AgreementsPage />} />,
  <Route key="onboarding-payment" path="/onboarding/payment" element={<OnboardingPaymentPage />} />,
  <Route key="onboarding-concierge-calculator" path="/onboarding/concierge-calculator" element={<ConciergeCalculatorPage />} />,
  <Route key="onboarding-resume" path="/onboarding/resume" element={<OnboardingResumePage />} />,
  <Route key="onboarding-post-payment" path="/onboarding/post-payment" element={<PostPaymentPage />} />,
  <Route key="concierge-doctor-signup" path="/concierge-doctor-signup" element={<ConciergeDoctorSignup />} />,
  <Route key="concierge-onboarding" path="/concierge-onboarding" element={<ConciergeDoctorOnboarding />} />,
];

export const OnboardingRoutes = () => null;
