import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  LayoutDashboard, Calendar, Users, Briefcase, Package,
  FileText, Settings, Mail, Webhook,
  CalendarDays, MessageSquare
} from 'lucide-react';

type SidebarItem = { name: string; icon: any; path: string; roles?: string[]; badge?: boolean };
type SidebarSection = { label: string; items: SidebarItem[] };

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    label: 'MAIN',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard/super_admin' },
      { name: 'Calendar', icon: Calendar, path: '/dashboard/super_admin/calendar' },
      { name: 'Appointments', icon: CalendarDays, path: '/dashboard/super_admin/appointments' },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { name: 'Users', icon: Users, path: '/dashboard/super_admin/users' },
      { name: 'Staff', icon: Briefcase, path: '/dashboard/super_admin/staff' },
      { name: 'Services', icon: Package, path: '/dashboard/super_admin/services' },
      { name: 'SMS Messages', icon: MessageSquare, path: '/dashboard/super_admin/sms', badge: true },
    ],
  },
  {
    label: 'MARKETING',
    items: [
      { name: 'Campaigns', icon: Mail, path: '/dashboard/super_admin/marketing' },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { name: 'Documentation', icon: FileText, path: '/dashboard/super_admin/documentation', roles: ['super_admin'] },
      { name: 'Webhooks', icon: Webhook, path: '/dashboard/super_admin/webhooks', roles: ['super_admin'] },
      { name: 'Settings', icon: Settings, path: '/dashboard/super_admin/settings', roles: ['super_admin'] },
    ],
  },
];

const AdminSidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const userRole = user?.role || 'patient';
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
    if (path === '/dashboard/super_admin') {
      return location.pathname === path;
    }
    return location.pathname === path;
  };

  return (
    <aside className="w-60 bg-gray-950 text-white min-h-screen flex flex-col">
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
      <div className="p-4 border-t border-gray-800">
        <Link
          to="/"
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to Website
        </Link>
      </div>
    </aside>
  );
};

export default AdminSidebar;
