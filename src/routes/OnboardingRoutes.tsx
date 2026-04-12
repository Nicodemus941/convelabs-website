import React, { lazy } from 'react';
import { Route } from 'react-router-dom';

const AccountCreationPage = lazy(() => import('../pages/onboarding/Account'));
const PlanSelectionPage = lazy(() => import('../pages/onboarding/PlanSelection'));
const PostPaymentPage = lazy(() => import('../pages/onboarding/PostPayment'));
const ConciergeDoctorSignup = lazy(() => import('../pages/ConciergeDoctorSignup'));
const ConciergeDoctorOnboarding = lazy(() => import('../pages/ConciergeDoctorOnboarding'));

export const routes = [
  <Route key="onboarding-account" path="/onboarding/account" element={<AccountCreationPage />} />,
  <Route key="onboarding-plan-selection" path="/onboarding/plan-selection" element={<PlanSelectionPage />} />,
  <Route key="onboarding-post-payment" path="/onboarding/post-payment" element={<PostPaymentPage />} />,
  <Route key="concierge-doctor-signup" path="/concierge-doctor-signup" element={<ConciergeDoctorSignup />} />,
  <Route key="concierge-onboarding" path="/concierge-onboarding" element={<ConciergeDoctorOnboarding />} />,
];

export const OnboardingRoutes = () => null;
