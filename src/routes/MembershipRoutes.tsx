import React from 'react';
import { Route } from 'react-router-dom';
import MembershipRedirect from '../components/membership/MembershipRedirect';

// Export routes as an array of Route elements that redirect to appointments site
export const routes = [
  <Route key="membership-redirect" path="/membership" element={<MembershipRedirect />} />,
  <Route key="individual-membership" path="/membership/individual" element={<MembershipRedirect />} />,
  <Route key="family-membership" path="/membership/family" element={<MembershipRedirect />} />,
  <Route key="plus-one-membership" path="/membership/plus-one" element={<MembershipRedirect />} />,
  <Route key="concierge-doctor-membership" path="/membership/concierge-doctor" element={<MembershipRedirect />} />,
];

// Keep the component for backward compatibility but return null
export const MembershipRoutes = () => null;
