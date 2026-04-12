
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { CalendarDays, User, Stethoscope, Settings, UsersRound, Building2, FlaskConical, TestTube2, Webhook } from 'lucide-react';

const AdminNavigation = () => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    return location.pathname.includes(path);
  };

  const navItems = [
    {
      name: 'Dashboard',
      path: '/dashboard/super_admin',
      icon: <CalendarDays className="h-5 w-5" />,
    },
    {
      name: 'Users',
      path: '/dashboard/super_admin/users',
      icon: <User className="h-5 w-5" />,
    },
    {
      name: 'Phlebotomists',
      path: '/dashboard/super_admin/phlebotomists',
      icon: <Stethoscope className="h-5 w-5" />,
    },
    {
      name: 'Tenants',
      path: '/dashboard/super_admin/tenants',
      icon: <Building2 className="h-5 w-5" />,
    },
    {
      name: 'Lab Tests',
      path: '/dashboard/super_admin/labs',
      icon: <FlaskConical className="h-5 w-5" />,
    },
    {
      name: 'Settings',
      path: '/dashboard/super_admin/settings',
      icon: <Settings className="h-5 w-5" />,
    },
    {
      name: 'Webhooks',
      path: '/dashboard/super_admin/webhooks',
      icon: <Webhook className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-1">
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 transition-all",
            isActive(item.path)
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {item.icon}
          <span>{item.name}</span>
        </Link>
      ))}
      
      {/* Demo Patient Setup Link */}
      <Link
        to="/demo-patient"
        className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all mt-6 bg-blue-100 text-blue-900 hover:bg-blue-200"
      >
        <TestTube2 className="h-5 w-5" />
        <span>Demo Patient Setup</span>
      </Link>
    </div>
  );
};

export default AdminNavigation;
