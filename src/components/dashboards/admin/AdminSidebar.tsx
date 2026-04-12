import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Users, Briefcase, Package,
  FileText, Settings, Mail, Webhook, BarChart3,
  CalendarDays, UserPlus, CreditCard
} from 'lucide-react';

const SIDEBAR_SECTIONS = [
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
      { name: 'Documentation', icon: FileText, path: '/dashboard/super_admin/documentation' },
      { name: 'Webhooks', icon: Webhook, path: '/dashboard/super_admin/webhooks' },
      { name: 'Settings', icon: Settings, path: '/dashboard/super_admin/settings' },
    ],
  },
];

const AdminSidebar: React.FC = () => {
  const location = useLocation();

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
        {SIDEBAR_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <p className="px-5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
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
                    <Icon className={`h-4 w-4 ${active ? 'text-conve-red' : ''}`} />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
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
