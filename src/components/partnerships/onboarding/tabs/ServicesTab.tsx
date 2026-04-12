
import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import TabNavigation from "../TabNavigation";
import FormSection from "../FormSection";

interface ServicesTabProps {
  formData?: any;
  data?: any;
  handleInputChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChange?: (field: string, value: any) => void;
  handlePrevious?: () => void;
  handleNext?: () => void;
}

const ServicesTab: React.FC<ServicesTabProps> = ({ 
  formData,
  data,
  handleInputChange,
  onChange,
  handlePrevious,
  handleNext
}) => {
  // Support both data formats
  const actualData = data || formData;
  
  // Support both change handler patterns
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (handleInputChange) {
      handleInputChange(e);
    } else if (onChange) {
      onChange(e.target.name, e.target.value);
    }
  };
  
  return (
    <>
      <div>
        <Label htmlFor="services">Services Offered *</Label>
        <Textarea 
          id="services" 
          name="services" 
          value={actualData?.services || actualData?.servicesOffered || ''} 
          onChange={handleChange}
          rows={8}
          required 
          placeholder="List all services you offer, one per line. Include brief descriptions if needed."
        />
      </div>
      
      {(handleNext && handlePrevious) && (
        <TabNavigation onPrevious={handlePrevious} onNext={handleNext} />
      )}
    </>
  );
};

export default ServicesTab;
