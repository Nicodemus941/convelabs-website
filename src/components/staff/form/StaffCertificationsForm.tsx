
import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface StaffCertificationsFormProps {
  formValues: {
    hired_date: string;
    certification_details: string;
  };
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  // Add the props being passed from StaffFormDialog
  staffMember?: any;
  onSave?: (data: any) => Promise<void>;
  isLoading?: boolean;
}

const StaffCertificationsForm: React.FC<StaffCertificationsFormProps> = ({
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
        <Label htmlFor="hired_date" className="text-right">
          Hired Date
        </Label>
        <Input
          id="hired_date"
          name="hired_date"
          className="col-span-3"
          value={formValues.hired_date}
          onChange={handleInputChange}
          type="date"
        />
      </div>
      
      <div className="grid grid-cols-4 items-start gap-4">
        <Label htmlFor="certification_details" className="text-right pt-2">
          Certifications
        </Label>
        <Textarea
          id="certification_details"
          name="certification_details"
          className="col-span-3"
          value={formValues.certification_details}
          onChange={handleInputChange}
          placeholder='{"type": "CPR", "expiration": "2025-12-31"}'
          rows={4}
        />
        <div className="col-start-2 col-span-3 -mt-3">
          <p className="text-xs text-gray-500">Enter as JSON format. Example: {`{"type": "CPR", "expiration": "2025-12-31"}`}</p>
        </div>
      </div>
    </>
  );
};

export default StaffCertificationsForm;
