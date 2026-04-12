
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Users, MapPin, BarChart, Calendar, BookOpen, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const FranchiseDashboardNavigation = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isActive = (path: string) => location.pathname === path;
  
  // Check if user is an admin or regular franchise owner
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  
  const navItems = [
    {
      label: "Dashboard",
      icon: <Home className="h-4 w-4" />,
      path: isAdmin ? "/dashboard/super_admin" : "/dashboard",
      active: isActive(isAdmin ? "/dashboard/super_admin" : "/dashboard")
    },
    {
      label: "Franchise Portal",
      icon: <BarChart className="h-4 w-4" />,
      path: "/franchise-portal",
      active: isActive("/franchise-portal")
    },
    {
      label: "Territories",
      icon: <MapPin className="h-4 w-4" />,
      path: "/territories",
      active: isActive("/territories")
    },
    {
      label: "Staff",
      icon: <Users className="h-4 w-4" />,
      path: "/staff",
      active: isActive("/staff")
    },
    {
      label: "Schedule",
      icon: <Calendar className="h-4 w-4" />,
      path: "/schedule",
      active: isActive("/schedule")
    },
    {
      label: "Resources",
      icon: <BookOpen className="h-4 w-4" />,
      path: "/resources",
      active: isActive("/resources")
    },
    {
      label: "Support",
      icon: <MessageSquare className="h-4 w-4" />,
      path: "/support",
      active: isActive("/support")
    }
  ];
  
  // Admin only navigation items
  const adminNavItems = [
    {
      label: "Franchise Admin",
      icon: <MapPin className="h-4 w-4" />,
      path: "/franchise-admin",
      active: isActive("/franchise-admin")
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
        
        {isAdmin && adminNavItems.map((item, index) => (
          <Link 
            key={`admin-${index}`} 
            to={item.path}
            className={`flex items-center gap-1 px-3 py-2 rounded-md whitespace-nowrap ml-2 ${
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

export default FranchiseDashboardNavigation;
