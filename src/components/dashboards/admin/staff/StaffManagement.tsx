
import React, { useState, useEffect } from 'react';
import StaffHeader from './StaffHeader';
import StaffTable from './StaffTable';
import StaffFilters from './StaffFilters';
import StaffForm from './StaffForm';
import StaffErrorState from './StaffErrorState';
import ServiceAreaManagement from '../serviceAreas/ServiceAreaManagement';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useStaffProfiles } from '@/hooks/useStaffProfiles';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';

const StaffManagement: React.FC = () => {
  const {
    staffProfiles,
    isLoading,
    error,
    fetchStaffProfiles: loadStaffProfiles,
  } = useStaffProfiles();
  const [filters, setFilters] = useState<Record<string, any>>({ role: '', specialty: '' });
  
  const [showForm, setShowForm] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  
  useEffect(() => {
    loadStaffProfiles();
  }, [loadStaffProfiles]);
  
  const handleAddStaff = () => {
    setSelectedStaff(null);
    setShowForm(true);
  };
  
  const handleEditStaff = (staffMember: any) => {
    setSelectedStaff(staffMember);
    setShowForm(true);
  };
  
  const handleFormClose = (shouldRefresh = false) => {
    setShowForm(false);
    if (shouldRefresh) {
      loadStaffProfiles();
    }
  };
  
  if (error) {
    return <StaffErrorState error={error} onRetry={loadStaffProfiles} />;
  }
  
  return (
    <div className="space-y-8">
      <Tabs defaultValue="staff">
        <TabsList className="mb-6">
          <TabsTrigger value="staff">Staff Management</TabsTrigger>
          <TabsTrigger value="areas">Service Areas</TabsTrigger>
        </TabsList>
        
        <TabsContent value="staff">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold">Staff Management</h2>
              <Button onClick={handleAddStaff}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Staff
              </Button>
            </div>
            
            {/* Using our own filtering UI instead of StaffFilters component */}
            <div className="bg-background border rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3">Filters</h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1">
                  <select 
                    className="w-full p-2 border rounded" 
                    value={filters.role || ''} 
                    onChange={(e) => setFilters({...filters, role: e.target.value || undefined})}
                  >
                    <option value="">All Roles</option>
                    <option value="phlebotomist">Phlebotomist</option>
                    <option value="nurse">Nurse</option>
                    <option value="office_staff">Office Staff</option>
                  </select>
                </div>
                <div className="flex-1">
                  <select 
                    className="w-full p-2 border rounded"
                    value={filters.specialty || ''}
                    onChange={(e) => setFilters({...filters, specialty: e.target.value || undefined})}
                  >
                    <option value="">All Specialties</option>
                    <option value="blood_draw">Blood Draw</option>
                    <option value="home_visit">Home Visit</option>
                  </select>
                </div>
                <Button 
                  variant="outline"
                  onClick={() => setFilters({})}
                >
                  Clear
                </Button>
              </div>
            </div>
            
            {/* Custom staff table implementation */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Role</th>
                    <th className="text-left p-4 font-medium">Specialty</th>
                    <th className="text-left p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8">
                        Loading staff data...
                      </td>
                    </tr>
                  ) : staffProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8">
                        No staff members found
                      </td>
                    </tr>
                  ) : (
                    staffProfiles.map(staff => (
                      <tr key={staff.id} className="border-t">
                        <td className="p-4">{staff.user?.full_name || 'Unknown'}</td>
                        <td className="p-4">{staff.user?.role || 'N/A'}</td>
                        <td className="p-4">{staff.specialty || 'N/A'}</td>
                        <td className="p-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleEditStaff(staff)}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {showForm && (
              <StaffForm
                key={selectedStaff ? selectedStaff.id : 'new-staff'}
                staffMember={selectedStaff}
                onClose={handleFormClose}
                loadStaffProfiles={loadStaffProfiles}
              />
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="areas">
          <ServiceAreaManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StaffManagement;
