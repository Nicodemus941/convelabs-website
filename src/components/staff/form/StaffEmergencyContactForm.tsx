
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface StaffEmergencyContactFormProps {
  formValues: {
    emergency_contact_name: string;
    emergency_contact_phone: string;
    emergency_contact_relationship: string;
  };
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  // Add the props being passed from StaffFormDialog
  staffMember?: any;
  onSave?: (data: any) => Promise<void>;
  isLoading?: boolean;
}

const StaffEmergencyContactForm: React.FC<StaffEmergencyContactFormProps> = ({
  formValues,
  handleInputChange,
  // These can be ignored since they're not used directly
  staffMember,
  onSave,
  isLoading,
}) => {
  return (
    <>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="emergency_contact_name" className="text-right">
          Emergency Contact
        </Label>
        <Input
          id="emergency_contact_name"
          name="emergency_contact_name"
          className="col-span-3"
          value={formValues.emergency_contact_name}
          onChange={handleInputChange}
          placeholder="Name"
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="emergency_contact_phone" className="text-right">
          Contact Phone
        </Label>
        <Input
          id="emergency_contact_phone"
          name="emergency_contact_phone"
          className="col-span-3"
          value={formValues.emergency_contact_phone}
          onChange={handleInputChange}
          placeholder="Phone number"
        />
      </div>
      
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="emergency_contact_relationship" className="text-right">
          Relationship
        </Label>
        <Input
          id="emergency_contact_relationship"
          name="emergency_contact_relationship"
          className="col-span-3"
          value={formValues.emergency_contact_relationship}
          onChange={handleInputChange}
          placeholder="e.g. Spouse, Parent"
        />
      </div>
    </>
  );
};

export default StaffEmergencyContactForm;
