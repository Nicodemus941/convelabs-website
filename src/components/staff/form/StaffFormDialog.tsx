
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import StaffBasicInfoForm from './StaffBasicInfoForm';
import StaffCertificationsForm from './StaffCertificationsForm';
import StaffEmergencyContactForm from './StaffEmergencyContactForm';
import ServiceAreaAssignment from '@/components/dashboards/admin/staff/ServiceAreaAssignment';
import { useStaffForm } from './useStaffForm';

interface StaffFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  staffMember: any;
  onSave: (data: any) => Promise<void>;
  isLoading: boolean;
}

const StaffFormDialog: React.FC<StaffFormDialogProps> = ({
  isOpen,
  onClose,
  staffMember,
  onSave,
  isLoading,
}) => {
  const [activeTab, setActiveTab] = useState('basic');
  
  const {
    existingUsers,
    selectedUserId,
    selectedUser,
    formValues,
    setSelectedUserId,
    handleInputChange,
    handleSubmit
  } = useStaffForm(isOpen, onClose, staffMember);
  
  const isPhlebotomist = staffMember?.user_profile?.role === 'phlebotomist' || 
                         staffMember?.specialty === 'phlebotomist';
  
  const isEditMode = Boolean(staffMember);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {staffMember ? 'Edit Staff Member' : 'Add Staff Member'}
          </DialogTitle>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="certifications">Certifications</TabsTrigger>
            <TabsTrigger value="emergency">Emergency Contact</TabsTrigger>
            {isPhlebotomist && staffMember?.id && (
              <TabsTrigger value="service-areas">Service Areas</TabsTrigger>
            )}
          </TabsList>
          
          <TabsContent value="basic">
            <StaffBasicInfoForm
              selectedUserId={selectedUserId}
              selectedUser={selectedUser}
              existingUsers={existingUsers}
              isLoading={isLoading}
              setSelectedUserId={setSelectedUserId}
              isEditMode={isEditMode}
              formValues={formValues}
              handleInputChange={handleInputChange}
              staffMember={staffMember}
              onSave={onSave}
            />
          </TabsContent>
          
          <TabsContent value="certifications">
            <StaffCertificationsForm
              formValues={formValues}
              handleInputChange={handleInputChange}
              staffMember={staffMember}
              onSave={onSave}
              isLoading={isLoading}
            />
          </TabsContent>
          
          <TabsContent value="emergency">
            <StaffEmergencyContactForm
              formValues={formValues}
              handleInputChange={handleInputChange}
              staffMember={staffMember}
              onSave={onSave}
              isLoading={isLoading}
            />
          </TabsContent>
          
          {isPhlebotomist && staffMember?.id && (
            <TabsContent value="service-areas">
              <ServiceAreaAssignment phlebotomistId={staffMember.id} />
            </TabsContent>
          )}
          
          <div className="mt-6 flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save Staff Member'}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default StaffFormDialog;
