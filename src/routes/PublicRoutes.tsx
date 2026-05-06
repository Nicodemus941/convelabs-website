import React, { lazy, Suspense } from 'react';
import { Route, Navigate } from 'react-router-dom';

// Home loads eagerly (landing page)
import Home from '../pages/Home';

// All other pages lazy-loaded
const Pricing = lazy(() => import('../pages/Pricing'));
const Brand = lazy(() => import('../pages/Brand'));
const About = lazy(() => import('../pages/About'));
const Contact = lazy(() => import('../pages/Contact'));
const Login = lazy(() => import('../pages/Login'));
const Signup = lazy(() => import('../pages/Signup'));
const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('../pages/TermsOfService'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/ResetPassword'));
const Guarantee = lazy(() => import('../pages/Guarantee'));
const PhlebotomistSignup = lazy(() => import('../pages/PhlebotomistSignup'));
const Blog = lazy(() => import('../pages/Blog'));
const BlogPost = lazy(() => import('../pages/BlogPost'));
const FAQ = lazy(() => import('../pages/FAQ'));
const B2BPartnerships = lazy(() => import('../pages/B2BPartnerships'));
const Partnerships = lazy(() => import('../pages/Partnerships'));
const PartnershipOnboarding = lazy(() => import('../pages/PartnershipOnboarding'));
const PartnershipSuccess = lazy(() => import('../pages/PartnershipSuccess'));
const PartnerWithUs = lazy(() => import('../pages/PartnerWithUs'));
const PartnerWithUsThanks = lazy(() => import('../pages/PartnerWithUsThanks'));
const BookNow = lazy(() => import('../pages/BookNow'));
const ProviderLogin = lazy(() => import('../pages/ProviderLogin'));
const PatientLabRequestPage = lazy(() => import('../pages/PatientLabRequestPage'));
const AppointmentLabOrderUploadPage = lazy(() => import('../pages/AppointmentLabOrderUploadPage'));
const AppointmentConfirmPage = lazy(() => import('../pages/AppointmentConfirmPage'));
const AppointmentTrackPage = lazy(() => import('../pages/AppointmentTrackPage'));
const ProviderClaimPage = lazy(() => import('../pages/ProviderClaimPage'));
const JoinTier = lazy(() => import('../pages/JoinTier'));
const CheckoutSuccessPage = lazy(() => import('../pages/CheckoutSuccessPage'));

const Corporate = lazy(() => import('../pages/Corporate'));
const CorporateCheckout = lazy(() => import('../pages/CorporateCheckout'));
const CorporateBilling = lazy(() => import('../pages/CorporateBilling'));
const CorporateInviteAccept = lazy(() => import('../pages/CorporateInviteAccept'));

const LuxuryMobilePhlebotomy = lazy(() => import('../pages/LuxuryMobilePhlebotomy'));
const ExecutiveHealthOrlando = lazy(() => import('../pages/ExecutiveHealthOrlando'));
const ConciergePhlebotomy = lazy(() => import('../pages/ConciergePhlebotomy'));
const LabTestingServices = lazy(() => import('../pages/LabTestingServices'));
const VSLabCorp = lazy(() => import('../pages/VSLabCorp'));
const LocationPage = lazy(() => import('../pages/LocationPage'));
const NationwideMobilePhlebotomy = lazy(() => import('../pages/NationwideMobilePhlebotomy'));
const RateAppointment = lazy(() => import('../pages/RateAppointment'));
const TrackAppointment = lazy(() => import('../pages/TrackAppointment'));

// Legacy redirect component
const LocationRedirect: React.FC<{ slug: string }> = ({ slug }) => (
  <Navigate to={`/locations/${slug}`} replace />
);

// Export routes as an array of Route elements
export const routes = [
  <Route key="home" path="/" element={<Home />} />,
  <Route key="book-now" path="/book-now" element={<BookNow />} />,
  <Route key="pricing" path="/pricing" element={<Pricing />} />,
  <Route key="brand" path="/brand" element={<Brand />} />,
  <Route key="about" path="/about" element={<About />} />,
  <Route key="contact" path="/contact" element={<Contact />} />,
  <Route key="faq" path="/faq" element={<FAQ />} />,
  <Route key="b2b" path="/b2b" element={<B2BPartnerships />} />,
  <Route key="partnerships" path="/partnerships" element={<Partnerships />} />,
  <Route key="partnership-onboarding" path="/partnership-onboarding" element={<PartnershipOnboarding />} />,
  <Route key="partnership-success" path="/partnership-success" element={<PartnershipSuccess />} />,
  <Route key="partner-with-us" path="/partner-with-us" element={<PartnerWithUs />} />,
  <Route key="partner-with-us-thanks" path="/partner-with-us/thanks" element={<PartnerWithUsThanks />} />,
  
  // Corporate Routes
  <Route key="corporate" path="/corporate" element={<Corporate />} />,
  <Route key="corporate-checkout" path="/corporate-checkout" element={<CorporateCheckout />} />,
  <Route key="corporate-billing" path="/corporate-billing" element={<CorporateBilling />} />,
  <Route key="corporate-invite" path="/corporate-invite/:token" element={<CorporateInviteAccept />} />,
  <Route key="login" path="/login" element={<Login />} />,
  <Route key="provider" path="/provider" element={<ProviderLogin />} />,
  <Route key="lab-request" path="/lab-request/:token" element={<PatientLabRequestPage />} />,
  // No-auth-wall lab order upload from an existing scheduled appointment.
  // Patient lands here from the "Request Lab Order" SMS/email an admin
  // fired off the appointment card.
  <Route key="appt-upload" path="/appt/:token/upload-order" element={<AppointmentLabOrderUploadPage />} />,
  // Self-service confirm: 48h-out SMS link → confirm/reschedule/cancel
  <Route key="appt-confirm" path="/appt/:token/confirm" element={<AppointmentConfirmPage />} />,
  // Live "phleb is on the way" tracker; SMS fires when phleb taps OTW
  <Route key="appt-track" path="/appt/:token/track" element={<AppointmentTrackPage />} />,
  // /join (no token) handles the email-upsell direct-checkout: ?tier=vip&email=…
  // Must come BEFORE /join/:token so the typed query path takes precedence
  // when there's no token segment in the URL.
  <Route key="join-tier" path="/join" element={<JoinTier />} />,
  <Route key="provider-claim" path="/join/:token" element={<ProviderClaimPage />} />,
  <Route key="welcome" path="/welcome" element={<CheckoutSuccessPage />} />,
  <Route key="payment-success" path="/payment-success" element={<CheckoutSuccessPage />} />,
  <Route key="signup" path="/signup" element={<Signup />} />,
  <Route key="forgot-password" path="/forgot-password" element={<ForgotPassword />} />,
  <Route key="reset-password" path="/reset-password" element={<ResetPassword />} />,
  <Route key="guarantee" path="/guarantee" element={<Guarantee />} />,
  <Route key="privacy-policy" path="/privacy-policy" element={<PrivacyPolicy />} />,
  <Route key="terms-of-service" path="/terms-of-service" element={<TermsOfService />} />,
  <Route key="phlebotomist-signup" path="/phlebotomist-signup" element={<PhlebotomistSignup />} />,
  <Route key="blog" path="/blog" element={<Blog />} />,
  <Route key="blog-post" path="/blog/:postId" element={<BlogPost />} />,
  
  // Luxury Service Routes
  <Route key="luxury-mobile-phlebotomy" path="/luxury-mobile-phlebotomy" element={<LuxuryMobilePhlebotomy />} />,
  <Route key="executive-health-orlando" path="/executive-health-orlando" element={<ExecutiveHealthOrlando />} />,
  <Route key="concierge-phlebotomy" path="/concierge-phlebotomy" element={<ConciergePhlebotomy />} />,
  <Route key="lab-testing" path="/lab-testing" element={<LabTestingServices />} />,
  <Route key="vs-labcorp" path="/vs-labcorp" element={<VSLabCorp />} />,
  <Route key="nationwide" path="/nationwide-mobile-phlebotomy-network" element={<NationwideMobilePhlebotomy />} />,

  // Rating & Tracking
  <Route key="rate-appointment" path="/rate/:appointmentId" element={<RateAppointment />} />,
  <Route key="track-appointment" path="/track/:appointmentId" element={<TrackAppointment />} />,
  
  // Dynamic location route
  <Route key="location-dynamic" path="/locations/:slug" element={<LocationPage />} />,
  
  // Legacy location redirects for SEO continuity
  <Route key="isleworth" path="/isleworth" element={<LocationRedirect slug="isleworth" />} />,
  <Route key="bay-hill" path="/bay-hill" element={<LocationRedirect slug="bay-hill" />} />,
  <Route key="golden-oak" path="/golden-oak" element={<LocationRedirect slug="golden-oak" />} />,
  <Route key="lake-nona" path="/lake-nona" element={<LocationRedirect slug="lake-nona" />} />,
  <Route key="heathrow-golf" path="/heathrow-golf" element={<LocationRedirect slug="heathrow-golf" />} />,
  <Route key="yacht-mobile-lab" path="/yacht-mobile-lab" element={<LocationRedirect slug="yacht-mobile-lab" />} />,
];
