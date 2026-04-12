
import React from 'react';
import { Tenant } from '@/types/tenant';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Building, PlusCircle, Settings, Users, Stethoscope, CreditCard, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TenantHeaderProps {
  tenant: Tenant;
}

const TenantHeader: React.FC<TenantHeaderProps> = ({ tenant }) => {
  const navigate = useNavigate();
  
  return (
    <div className="flex flex-col space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white"
            style={{ backgroundColor: tenant.branding.primary_color || '#4f46e5' }}
          >
            <Building size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-muted-foreground">{tenant.slug}</p>
          </div>
        </div>
        
        <div className="flex space-x-2 overflow-x-auto pb-1">
          <Button variant="outline" onClick={() => navigate(`/book/${tenant.id}`)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Book Appointment
          </Button>
          <Button variant="outline" onClick={() => navigate(`/tenant/dashboard/${tenant.id}/patients`)}>
            <Stethoscope className="mr-2 h-4 w-4" />
            Patients
          </Button>
          <Button variant="outline" onClick={() => navigate(`/tenant/dashboard/${tenant.id}/services`)}>
            <CreditCard className="mr-2 h-4 w-4" />
            Services
          </Button>
          <Button variant="outline" onClick={() => navigate(`/tenant/dashboard/${tenant.id}/appointments`)}>
            <Calendar className="mr-2 h-4 w-4" />
            Appointments
          </Button>
          <Button variant="outline" onClick={() => navigate(`/tenant/dashboard/${tenant.id}/settings`)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>
      <Separator />
    </div>
  );
};

export default TenantHeader;
