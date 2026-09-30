import React from 'react';
import TodayExecutionView from './admin/TodayExecutionView';

/**
 * The super_admin landing screen is Today, and only Today.
 *
 * It used to be an "Owner Dashboard" that opened with a Stripe revenue band,
 * six KPI tiles, two charts, Profit First allocations and a Quick Actions menu
 * repeating the sidebar — with the day's actual visits buried in the middle.
 * That analytics screen still exists, owner-gated, at Owner → Business metrics.
 */
const SuperAdminDashboard: React.FC = () => (
  <TodayExecutionView basePath="/dashboard/super_admin" />
);

export default SuperAdminDashboard;
