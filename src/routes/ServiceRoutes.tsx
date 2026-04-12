import React, { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';

const LocationPage = lazy(() => import('../pages/LocationPage'));

const LocationRedirect: React.FC<{ slug: string }> = ({ slug }) => (
  <Navigate to={`/locations/${slug}`} replace />
);

export const routes = [
  <Route key="location-dynamic" path="/locations/:slug" element={<LocationPage />} />,
  
  <Route key="windermere" path="/windermere" element={<LocationRedirect slug="windermere" />} />,
  <Route key="windermere-services" path="/services/windermere" element={<LocationRedirect slug="windermere" />} />,
  <Route key="orlando" path="/orlando" element={<LocationRedirect slug="orlando" />} />,
  <Route key="orlando-services" path="/services/orlando" element={<LocationRedirect slug="orlando" />} />,
  <Route key="winter-park" path="/winter-park" element={<LocationRedirect slug="winter-park" />} />,
  <Route key="winter-park-services" path="/services/winter-park" element={<LocationRedirect slug="winter-park" />} />,
  <Route key="doctor-phillips" path="/doctor-phillips" element={<LocationRedirect slug="doctor-phillips" />} />,
  <Route key="doctor-phillips-services" path="/services/doctor-phillips" element={<LocationRedirect slug="doctor-phillips" />} />,
  <Route key="celebration" path="/celebration" element={<LocationRedirect slug="celebration" />} />,
  <Route key="celebration-services" path="/services/celebration" element={<LocationRedirect slug="celebration" />} />,
];
