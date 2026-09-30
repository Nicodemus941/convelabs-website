import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut } from 'lucide-react';
import {
  ADMIN_SECTIONS, isSectionVisible, checkPlatformOwner,
  type AdminSection, type BadgeKind,
} from './adminNav';
import { useAdminBadgeCounts, type AdminBadgeCounts } from './useAdminBadges';

/**
 * ADMIN SIDEBAR — 9 operational sections plus Owner and System.
 *
 * Was 27 flat items across 4 sections, which put owner-only financials
 * (Hormozi, Frank, Expenses, Upgrades) in four of the first six slots and
 * split one day's work across four separate queues. The list now comes from
 * adminNav.ts, the same file the router reads, so nav and routes cannot drift.
 */

const GROUPS: Array<{ key: AdminSection['group']; label: string }> = [
  { key: 'WORK', label: 'THE DAY' },
  { key: 'BUSINESS', label: 'THE BUSINESS' },
];

const badgeValue = (kind: BadgeKind | undefined, counts: AdminBadgeCounts): number => {
  if (!kind) return 0;
  if (kind === 'inbox') return counts.inbox;
  if (kind === 'labOrders') return counts.labOrders;
  if (kind === 'release') return counts.release;
  return 0;
};

const badgeTone = (kind: BadgeKind | undefined): string => {
  if (kind === 'inbox') return 'bg-red-500 text-white shadow-[0_0_6px_2px_rgba(239,68,68,0.45)]';
  if (kind === 'labOrders') return 'bg-emerald-500 text-white shadow-[0_0_6px_2px_rgba(16,185,129,0.45)]';
  return 'bg-purple-500 text-white';
};

interface AdminSidebarProps {
  onNavClick?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ onNavClick }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const userRole = user?.role || 'patient';
  const isPlatformOwner = checkPlatformOwner(user?.email);
  const basePath = `/dashboard/${userRole}`;
  const counts = useAdminBadgeCounts();

  // `today` is the dashboard root, so it matches both /dashboard/<role> and
  // /dashboard/<role>/today. Every other section matches its own prefix so a
  // sub-view keeps its parent highlighted.
  const isActive = (sectionId: string) => {
    const path = location.pathname.replace(/\/$/, '');
    if (sectionId === 'today') {
      return path === basePath || path === `${basePath}/today`;
    }
    return path === `${basePath}/${sectionId}` || path.startsWith(`${basePath}/${sectionId}/`);
  };

  const pathFor = (sectionId: string) =>
    sectionId === 'today' ? basePath : `${basePath}/${sectionId}`;

  return (
    <aside className="w-64 md:w-60 bg-gray-950 text-white h-full min-h-[100dvh] flex flex-col pt-14 md:pt-0">
      {/* Logo */}
      <div className="p-5 border-b border-gray-800">
        <Link to="/" className="text-xl font-bold text-white">
          ConveLabs<span className="text-conve-red">.</span>
        </Link>
        <p className="text-xs text-gray-500 mt-0.5">Admin Portal</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        {GROUPS.map(group => {
          const items = ADMIN_SECTIONS.filter(
            s => s.group === group.key && isSectionVisible(s, userRole, isPlatformOwner)
          );
          if (items.length === 0) return null;
          return (
            <div key={group.key} className="mb-5">
              <p className="px-5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {items.map(section => {
                  const Icon = section.icon;
                  const active = isActive(section.id);
                  const count = badgeValue(section.badge, counts);
                  return (
                    <Link
                      key={section.id}
                      to={pathFor(section.id)}
                      onClick={onNavClick}
                      className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-conve-red/20 text-white border-r-2 border-conve-red font-medium'
                          : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="relative">
                        <Icon className={`h-4 w-4 ${active ? 'text-conve-red' : ''}`} />
                        {count > 0 && !active && (
                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        )}
                      </div>
                      <span className="flex-1">{section.label}</span>
                      {count > 0 && (
                        <span
                          className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full ${
                            active ? 'bg-white text-conve-red' : badgeTone(section.badge)
                          }`}
                        >
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800 space-y-3">
        <Link
          to="/"
          onClick={onNavClick}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors block"
        >
          ← Back to Website
        </Link>
        <button
          onClick={async () => {
            try {
              await logout();
            } catch {
              window.location.href = '/login';
            }
          }}
          className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 transition-colors w-full"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
