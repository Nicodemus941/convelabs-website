
import React from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Package, Calendar, FileText, Settings, Webhook } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminTabsLayoutProps {
  children: React.ReactNode;
  title: string;
}

const AdminTabsLayout: React.FC<AdminTabsLayoutProps> = ({ children, title }) => {
  const { adminTab = "users" } = useParams<{ adminTab: string }>();

  const tabs = [
    { id: "users", label: "User Management", icon: <Users className="h-4 w-4" /> },
    { id: "services", label: "Services", icon: <Package className="h-4 w-4" /> },
    { id: "inventory", label: "Inventory", icon: <Package className="h-4 w-4" /> },
    { id: "appointments", label: "Appointments", icon: <Calendar className="h-4 w-4" /> },
    { id: "documentation", label: "Documentation", icon: <FileText className="h-4 w-4" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
    { id: "webhooks", label: "Webhooks", icon: <Webhook className="h-4 w-4" /> }
  ];

  return (
    <div className="container mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <div className="flex overflow-x-auto pb-2 mb-4 gap-2">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              to={`/dashboard/super_admin/${tab.id}`}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-md whitespace-nowrap transition-colors",
                adminTab === tab.id
                  ? "bg-conve-red text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {children}
    </div>
  );
};

export default AdminTabsLayout;
