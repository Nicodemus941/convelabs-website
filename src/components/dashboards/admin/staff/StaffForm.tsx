
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { LoaderIcon } from 'lucide-react';
import { useStaffProfiles } from '@/hooks/useStaffProfiles';
import ServiceAreaAssignment from './ServiceAreaAssignment';

export interface StaffFormProps {
  staffMember: any;
  onClose: (shouldRefresh?: boolean) => void;
  loadStaffProfiles?: () => Promise<any>;
}

const StaffForm: React.FC<StaffFormProps> = ({ staffMember, onClose, loadStaffProfiles }) => {
  const [activeTab, setActiveTab] = useState('basic');
  const [isLoading, setIsLoading] = useState(false);
  const { updateStaffProfile } = useStaffProfiles();
  
  const [formData, setFormData] = useState({
    pay_rate: staffMember ? (staffMember.pay_rate / 100).toString() : "0",
    premium_pay_rate: staffMember?.premium_pay_rate ? (staffMember.premium_pay_rate / 100).toString() : "",
    specialty: staffMember?.specialty || "",
    emergency_contact_name: staffMember?.emergency_contact_name || "",
    emergency_contact_phone: staffMember?.emergency_contact_phone || "",
    emergency_contact_relationship: staffMember?.emergency_contact_relationship || "",
    hired_date: staffMember?.hired_date || "",
    certification_details: staffMember?.certification_details ? JSON.stringify(staffMember.certification_details) : ""
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Process the form data
      const processedData: any = {
        pay_rate: Math.round(parseFloat(formData.pay_rate) * 100),
        specialty: formData.specialty || null
      };
      
      if (formData.premium_pay_rate) {
        processedData.premium_pay_rate = Math.round(parseFloat(formData.premium_pay_rate) * 100);
      }
      
      if (formData.emergency_contact_name) {
        processedData.emergency_contact_name = formData.emergency_contact_name;
      }
      
      if (formData.emergency_contact_phone) {
        processedData.emergency_contact_phone = formData.emergency_contact_phone;
      }
      
      if (formData.emergency_contact_relationship) {
        processedData.emergency_contact_relationship = formData.emergency_contact_relationship;
      }
      
      if (formData.hired_date) {
        processedData.hired_date = formData.hired_date;
      }
      
      if (formData.certification_details) {
        try {
          processedData.certification_details = JSON.parse(formData.certification_details);
        } catch (err) {
          toast.error("Invalid JSON in certification details");
          setIsLoading(false);
          return;
        }
      }
      
      if (staffMember?.id) {
        await updateStaffProfile(staffMember.id, processedData);
        toast.success("Staff profile updated successfully");
      }
      
      onClose(true);
    } catch (error) {
      console.error("Error saving staff profile:", error);
      toast.error("Failed to save staff profile");
    } finally {
      setIsLoading(false);
    }
  };
  
  const isPhlebotomist = staffMember?.user?.role === 'phlebotomist' || 
                         staffMember?.specialty === 'phlebotomist';
  
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="specialty">Specialty</Label>
                  <Input
                    id="specialty"
                    name="specialty"
                    value={formData.specialty}
                    onChange={handleInputChange}
                    placeholder="e.g., phlebotomist"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pay_rate">Pay Rate ($ per hour)</Label>
                  <Input
                    id="pay_rate"
                    name="pay_rate"
                    type="number"
                    step="0.01"
                    value={formData.pay_rate}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="premium_pay_rate">Premium Pay Rate ($ per hour)</Label>
                  <Input
                    id="premium_pay_rate"
                    name="premium_pay_rate"
                    type="number"
                    step="0.01"
                    value={formData.premium_pay_rate}
                    onChange={handleInputChange}
                    placeholder="Optional premium rate"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="hired_date">Hire Date</Label>
                  <Input
                    id="hired_date"
                    name="hired_date"
                    type="date"
                    value={formData.hired_date}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => onClose()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="certifications">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="certification_details">Certification Details (JSON)</Label>
                <Textarea
                  id="certification_details"
                  name="certification_details"
                  rows={8}
                  value={formData.certification_details}
                  onChange={handleInputChange}
                  placeholder='{"license": "12345", "expires": "2023-12-31", "certifications": ["CPR", "First Aid"]}'
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter certification details in JSON format
                </p>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => onClose()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="emergency">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_name">Emergency Contact Name</Label>
                  <Input
                    id="emergency_contact_name"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_phone">Emergency Contact Phone</Label>
                  <Input
                    id="emergency_contact_phone"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emergency_contact_relationship">Relationship</Label>
                  <Input
                    id="emergency_contact_relationship"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => onClose()}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : 'Save Changes'}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          {isPhlebotomist && staffMember?.id && (
            <TabsContent value="service-areas">
              <ServiceAreaAssignment phlebotomistId={staffMember.id} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default StaffForm;
