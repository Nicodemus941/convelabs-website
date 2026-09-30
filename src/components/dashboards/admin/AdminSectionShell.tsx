import React from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { AdminSection } from './adminNav';
import { isViewVisible } from './adminNav';
import { useAdminBadgeCounts, type AdminBadgeCounts } from './useAdminBadges';

/**
 * Sub-tab bar for a consolidated admin section.
 *
 * Replaces AdminTabsLayout, whose hardcoded tab list still pointed at
 * `inventory` and at the old flat paths. This one derives its tabs from
 * adminNav.ts and hides the bar entirely for single-screen sections, so
 * Today / Patients / Growth render with no chrome above them.
 */

interface AdminSectionShellProps {
  section: AdminSection;
  activeViewId: string | undefined;
  basePath: string;
  role: string;
  isPlatformOwner: boolean;
  children: React.ReactNode;
}

const subBadge = (viewId: string, counts: AdminBadgeCounts): number => {
  switch (viewId) {
    case 'action-items': return counts.actionItems;
    case 'tasks': return counts.tasks;
    case 'sms': return counts.sms;
    case 'chat': return counts.chat;
    case 'orders': return counts.labOrders;
    case 'whats-new': return counts.release;
    default: return 0;
  }
};

const AdminSectionShell: React.FC<AdminSectionShellProps> = ({
  section, activeViewId, basePath, role, isPlatformOwner, children,
}) => {
  const counts = useAdminBadgeCounts();
  const views = section.views.filter(v => isViewVisible(v, role, isPlatformOwner));

  // One view (or none) means no bar — the screen is the section.
  if (views.length <= 1) return <>{children}</>;

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200">
        <div className="flex items-end gap-1 overflow-x-auto -mb-px pb-0">
          {views.map(view => {
            const active = view.id === activeViewId;
            const count = subBadge(view.id, counts);
            return (
              <Link
                key={view.id}
                to={`${basePath}/${section.id}/${view.id}`}
                className={cn(
                  'flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap border-b-2 transition-colors',
                  active
                    ? 'border-[#B91C1C] text-[#B91C1C] font-semibold'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                )}
              >
                {view.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full',
                      active ? 'bg-[#B91C1C] text-white' : 'bg-gray-200 text-gray-700'
                    )}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
};

export default AdminSectionShell;
