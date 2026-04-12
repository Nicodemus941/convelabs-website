
import React, { useState, useEffect } from 'react';
import { Tenant, TenantPatient } from '@/types/tenant';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { UserPlus, Search } from 'lucide-react';
import TenantPatientDialog from './TenantPatientDialog';

interface TenantPatientsProps {
  tenant: Tenant;
}

const TenantPatients: React.FC<TenantPatientsProps> = ({ tenant }) => {
  const [patients, setPatients] = useState<TenantPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<TenantPatient | null>(null);

  useEffect(() => {
    fetchPatients();
  }, [tenant.id]);

  const fetchPatients = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tenant_patients')
        .select('*')
        .eq('tenant_id', tenant.id);

      if (error) throw error;
      
      setPatients(data as TenantPatient[]);
    } catch (error) {
      toast.error(`Failed to fetch patients: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredPatients = patients.filter(patient => {
    if (!searchQuery) return true;
    
    const fullName = `${patient.first_name} ${patient.last_name}`.toLowerCase();
    const query = searchQuery.toLowerCase();
    
    return (
      fullName.includes(query) ||
      patient.email.toLowerCase().includes(query) ||
      (patient.phone && patient.phone.includes(query))
    );
  });

  const handleAddPatient = () => {
    setCurrentPatient(null);
    setIsDialogOpen(true);
  };

  const handleEditPatient = (patient: TenantPatient) => {
    setCurrentPatient(patient);
    setIsDialogOpen(true);
  };

  const handleSavePatient = async (patientData: Partial<TenantPatient>) => {
    try {
      setIsLoading(true);
      
      if (currentPatient) {
        // Update existing patient
        const { data, error } = await supabase
          .from('tenant_patients')
          .update(patientData)
          .eq('id', currentPatient.id)
          .select()
          .single();

        if (error) throw error;
        
        setPatients(patients.map(p => p.id === currentPatient.id ? (data as TenantPatient) : p));
        toast.success("Patient updated successfully");
      } else {
        // Add new patient
        const newPatient = {
          ...patientData,
          tenant_id: tenant.id,
          email: patientData.email || '',
          first_name: patientData.first_name || '',
          last_name: patientData.last_name || '',
          is_active: true,
        };
        
        const { data, error } = await supabase
          .from('tenant_patients')
          .insert(newPatient)
          .select()
          .single();

        if (error) throw error;
        
        setPatients([...patients, data as TenantPatient]);
        toast.success("Patient added successfully");
      }
      
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(`Failed to save patient: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Patients</h2>
        <Button onClick={handleAddPatient}>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Patient
        </Button>
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search patients..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No patients found. Add your first patient to get started.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="grid grid-cols-5 gap-4 bg-secondary/50 p-4 font-medium">
            <div>Name</div>
            <div>Email</div>
            <div>Phone</div>
            <div>Membership</div>
            <div>Actions</div>
          </div>
          {filteredPatients.map((patient) => (
            <div key={patient.id} className="grid grid-cols-5 gap-4 p-4 hover:bg-secondary/20 border-t">
              <div>{patient.first_name} {patient.last_name}</div>
              <div className="truncate">{patient.email}</div>
              <div>{patient.phone || '-'}</div>
              <div>{patient.membership_status || 'None'}</div>
              <div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleEditPatient(patient)}
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <TenantPatientDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSavePatient}
        patient={currentPatient}
      />
    </div>
  );
};

export default TenantPatients;
