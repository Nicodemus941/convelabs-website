import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, Briefcase, Package,
  FileText, Settings, Mail, Webhook,
  CalendarDays, MessageSquare, LogOut, Receipt, FlaskConical, ClipboardList, Building2, Wrench, Sparkles, TrendingUp,
  Crown, GraduationCap,
} from 'lucide-react';

type SidebarItem = { name: string; icon: any; path: string; roles?: string[]; badge?: boolean };
type SidebarSection = { label: string; items: SidebarItem[] };

function getSidebarSections(basePath: string): SidebarSection[] {
  return [
    {
      label: 'MAIN',
      items: [
        { name: 'Dashboard', icon: LayoutDashboard, path: basePath },
        { name: 'Hormozi Dashboard', icon: TrendingUp, path: `${basePath}/hormozi`, roles: ['super_admin'] },
        { name: 'Upgrades & ROI', icon: Crown, path: `${basePath}/upgrades`, roles: ['super_admin'] },
        { name: 'Calendar', icon: Calendar, path: `${basePath}/calendar` },
        { name: 'Appointments', icon: CalendarDays, path: `${basePath}/appointments` },
        { name: 'Patients', icon: Users, path: `${basePath}/patients` },
      ],
    },
    {
      label: 'MANAGEMENT',
      items: [
        { name: 'Staff', icon: Briefcase, path: `${basePath}/staff` },
        { name: 'Services', icon: Package, path: `${basePath}/services` },
        { name: 'SMS Messages', icon: MessageSquare, path: `${basePath}/sms`, badge: true },
        { name: 'Invoices', icon: Receipt, path: `${basePath}/invoices` },
        { name: 'Organizations', icon: Building2, path: `${basePath}/organizations` },
        { name: 'Specimens', icon: FlaskConical, path: `${basePath}/specimens` },
        { name: 'Notes', icon: ClipboardList, path: `${basePath}/notes` },
        { name: 'Operations', icon: Wrench, path: `${basePath}/operations` },
        { name: 'AI Assistant', icon: Sparkles, path: `${basePath}/ai-assistant` },
        { name: 'Training', icon: GraduationCap, path: `${basePath}/training` },
        { name: 'Scripts & Playbooks', icon: FileText, path: `${basePath}/scripts` },
      ],
    },
    {
      label: 'MARKETING',
      items: [
        { name: 'Campaigns', icon: Mail, path: `${basePath}/marketing` },
        { name: 'Ask Nico Chatbot', icon: MessageSquare, path: `${basePath}/chatbot`, roles: ['super_admin'] },
        { name: 'Provider Acquisition', icon: Users, path: `${basePath}/provider-acquisition`, roles: ['super_admin'] },
      ],
    },
    {
      label: 'SYSTEM',
      items: [
        { name: 'Documentation', icon: FileText, path: `${basePath}/documentation`, roles: ['super_admin'] },
        { name: 'Webhooks', icon: Webhook, path: `${basePath}/webhooks`, roles: ['super_admin'] },
        { name: 'Settings', icon: Settings, path: `${basePath}/settings`, roles: ['super_admin'] },
      ],
    },
  ];
}

interface AdminSidebarProps {
  onNavClick?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ onNavClick }) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const userRole = user?.role || 'patient';
  const basePath = `/dashboard/${userRole}`;
  const SIDEBAR_SECTIONS = getSidebarSections(basePath);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  // Subscribe to new SMS messages for notification indicator
  useEffect(() => {
    const channel = supabase
      .channel('admin-sms-indicator')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_messages' }, () => {
        // Don't show indicator if already on SMS page
        if (!location.pathname.includes('/sms')) {
          setHasNewMessages(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [location.pathname]);

  // Clear indicator when navigating to SMS page
  useEffect(() => {
    if (location.pathname.includes('/sms')) {
      setHasNewMessages(false);
    }
  }, [location.pathname]);

  const isActive = (path: string) => {
    if (path === basePath) {
      return location.pathname === path || location.pathname === basePath;
    }
    return location.pathname === path;
  };

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
        {SIDEBAR_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(item => !item.roles || item.roles.includes(userRole));
          if (visibleItems.length === 0) return null;
          return (
          <div key={section.label} className="mb-5">
            <p className="px-5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onNavClick}
                    className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                      active
                        ? 'bg-conve-red/20 text-white border-r-2 border-conve-red font-medium'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="relative">
                      <Icon className={`h-4 w-4 ${active ? 'text-conve-red' : ''}`} />
                      {item.badge && hasNewMessages && !active && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_6px_2px_rgba(74,222,128,0.6)]" />
                      )}
                    </div>
                    {item.name}
                    {item.badge && hasNewMessages && !active && (
                      <span className="ml-auto w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_4px_1px_rgba(74,222,128,0.5)]" />
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
