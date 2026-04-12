
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, Map, BarChart } from 'lucide-react';

const DashboardNavigation = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  
  const navItems = [
    {
      label: "Dashboard",
      icon: <Home className="h-4 w-4" />,
      path: "/dashboard/super_admin",
      active: isActive("/dashboard/super_admin")
    },
    {
      label: "Franchise Admin",
      icon: <Map className="h-4 w-4" />,
      path: "/franchiseadmin",
      active: isActive("/franchiseadmin")
    },
    {
      label: "User Management",
      icon: <Users className="h-4 w-4" />,
      path: "/dashboard/super_admin/users",
      active: isActive("/dashboard/super_admin/users")
    },
    {
      label: "Analytics",
      icon: <BarChart className="h-4 w-4" />,
      path: "/dashboard/super_admin/analytics",
      active: isActive("/dashboard/super_admin/analytics")
    }
  ];
  
  return (
    <div className="bg-slate-50 p-2 rounded-lg mb-6 overflow-x-auto">
      <nav className="flex gap-2">
        {navItems.map((item, index) => (
          <Link 
            key={index} 
            to={item.path}
            className={`flex items-center gap-1 px-3 py-2 rounded-md whitespace-nowrap ${
              item.active 
                ? 'bg-white shadow-sm text-conve-red font-medium'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {item.icon} <span className="text-sm">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
};

export default DashboardNavigation;
