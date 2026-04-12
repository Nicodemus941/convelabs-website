
import React from 'react';
import { Link } from 'react-router-dom';
import { User, Users, Building2, Mail, FileText, Calendar, Package, Briefcase, Settings, Webhook } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DashboardCardProps {
  title: string;
  icon: React.ReactNode;
  description: string;
  link: string;
  linkText: string;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, icon, description, link, linkText }) => (
  <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow duration-300">
    <div className="flex items-center mb-2">
      {icon}
      <h3 className="text-lg font-semibold ml-2">{title}</h3>
    </div>
    <p className="text-sm text-gray-600 mb-4">{description}</p>
    <Link to={link} className="text-blue-500 hover:text-blue-700 transition-colors duration-200">
      {linkText}
    </Link>
  </div>
);

const SuperAdminDashboard = () => {
  console.log("Rendering SuperAdminDashboard component");
  
  return (
    <Card className="container mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold">Super Admin Dashboard</CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <DashboardCard 
            title="User Management"
            icon={<Users className="h-5 w-5" />}
            description="Manage user accounts, roles, and permissions"
            link="/dashboard/super_admin/users"
            linkText="Manage Users"
          />
          
          <DashboardCard 
            title="Staff Management"
            icon={<Briefcase className="h-5 w-5" />}
            description="Manage staff profiles, certifications, and roles"
            link="/dashboard/super_admin/staff"
            linkText="Manage Staff"
          />
          
          <DashboardCard 
            title="Franchise Management"
            icon={<Building2 className="h-5 w-5" />}
            description="Manage franchises, territories, and performance analytics"
            link="/franchiseadmin"
            linkText="Manage Franchises"
          />
          
          <DashboardCard 
            title="Marketing Campaigns"
            icon={<Mail className="h-5 w-5" />}
            description="Create and manage email marketing campaigns"
            link="/dashboard/super_admin/marketing"
            linkText="Manage Campaigns"
          />

          <DashboardCard 
            title="Documentation"
            icon={<FileText className="h-5 w-5" />}
            description="Manage system documentation and agreements"
            link="/dashboard/super_admin/documentation"
            linkText="Manage Documents"
          />

          <DashboardCard 
            title="Enhanced Appointments"
            icon={<Calendar className="h-5 w-5" />}
            description="Advanced appointment management with filters, statistics, and bulk operations"
            link="/dashboard/super_admin/appointments"
            linkText="Manage Appointments"
          />

          <DashboardCard 
            title="Services Management"
            icon={<Settings className="h-5 w-5" />}
            description="Create and manage lab services, pricing, and packages"
            link="/dashboard/super_admin/services"
            linkText="Manage Services"
          />

          <DashboardCard 
            title="Inventory"
            icon={<Package className="h-5 w-5" />}
            description="Manage supplies and equipment inventory"
            link="/dashboard/super_admin/inventory"
            linkText="Manage Inventory"
          />

          <DashboardCard 
            title="Webhook Events"
            icon={<Webhook className="h-5 w-5" />}
            description="Monitor GHS webhook events, view payloads, and retry failed events"
            link="/dashboard/super_admin/webhooks"
            linkText="View Webhooks"
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default SuperAdminDashboard;
