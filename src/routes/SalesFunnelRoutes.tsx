import React, { lazy } from 'react';
import { Route } from 'react-router-dom';

const SalesFunnelPage = lazy(() => import('@/pages/SalesFunnelPage'));

export const routes = [
  <Route key="try" path="/try" element={<SalesFunnelPage />} />,
  <Route key="sales-funnel" path="/sales-funnel" element={<SalesFunnelPage />} />,
  <Route key="funnel" path="/funnel" element={<SalesFunnelPage />} />,
];
