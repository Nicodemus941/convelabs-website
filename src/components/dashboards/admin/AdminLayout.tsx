import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-gray-950 text-white flex items-center justify-between px-4 min-h-[56px]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <Link to="/" className="text-lg font-bold">
          ConveLabs<span className="text-[#B91C1C]">.</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-gray-800"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile, slide-in when toggled */}
      <div className={`
        fixed md:sticky md:top-0 inset-y-0 left-0 z-40
        h-[100dvh] overflow-y-auto overflow-x-hidden
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0
      `}>
        <AdminSidebar onNavClick={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto md:pt-0" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
        <div className="p-4 md:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
