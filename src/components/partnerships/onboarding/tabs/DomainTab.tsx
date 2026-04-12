
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import TabNavigation from "../TabNavigation";
import FormSection from "../FormSection";

interface DomainTabProps {
  formData?: any;
  data?: any;
  handleInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChange?: (field: string, value: any) => void;
  handleNumberChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePrevious?: () => void;
  handleNext?: () => void;
}

const DomainTab: React.FC<DomainTabProps> = ({ 
  formData,
  data,
  handleInputChange,
  onChange,
  handleNumberChange,
  handlePrevious,
  handleNext
}) => {
  // Support both data formats
  const actualData = data || formData;
  
  // Support both change handler patterns
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (handleInputChange) {
      handleInputChange(e);
    } else if (onChange) {
      onChange(e.target.name, e.target.value);
    }
  };
  
  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (handleNumberChange) {
      handleNumberChange(e);
    } else if (onChange) {
      onChange(e.target.name, parseInt(e.target.value) || 1);
    }
  };
  
  return (
    <>
      <div>
        <Label htmlFor="preferredDomain">Preferred Domain or Subdomain *</Label>
        <Input 
          id="preferredDomain" 
          name="preferredDomain" 
          value={actualData?.preferredDomain || ''} 
          onChange={handleChange}
          required 
          placeholder="e.g., yourpractice.com or yourname.convelabs.com"
        />
        <p className="text-sm text-gray-500 mt-1">
          If you purchased domain setup, enter your preferred domain name. Otherwise, 
          we'll provide a subdomain on convelabs.com.
        </p>
      </div>
      
      <div>
        <Label htmlFor="numberOfStaffAccounts">Number of Staff Accounts *</Label>
        <Input 
          id="numberOfStaffAccounts" 
          name="numberOfStaffAccounts" 
          type="number" 
          min="1"
          value={actualData?.numberOfStaffAccounts || 2} 
          onChange={handleNumberInputChange}
          required 
        />
      </div>
      
      {(handleNext && handlePrevious) && (
        <TabNavigation onPrevious={handlePrevious} onNext={handleNext} />
      )}
    </>
  );
};

export default DomainTab;
