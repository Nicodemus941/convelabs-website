
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TabNavigation from "../TabNavigation";
import FormSection from "../FormSection";

interface PracticeInfoTabProps {
  formData?: any;
  data?: any;
  handleInputChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onChange?: (field: string, value: any) => void;
  handleNext?: () => void;
}

const PracticeInfoTab: React.FC<PracticeInfoTabProps> = ({ 
  formData,
  data,
  handleInputChange,
  onChange,
  handleNext
}) => {
  // Support both data formats
  const actualData = data || formData;
  
  // Support both change handler patterns
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (handleInputChange) {
      handleInputChange(e);
    } else if (onChange) {
      onChange(e.target.name, e.target.value);
    }
  };
  
  return (
    <>
      <div>
        <Label htmlFor="practiceName">Practice Name *</Label>
        <Input 
          id="practiceName" 
          name="practiceName" 
          value={actualData?.practiceName || ''} 
          onChange={handleChange} 
          required 
        />
      </div>
      
      <div>
        <Label htmlFor="practiceDescription">Practice Description *</Label>
        <Textarea 
          id="practiceDescription" 
          name="practiceDescription" 
          value={actualData?.practiceDescription || ''} 
          onChange={handleChange}
          rows={4}
          required 
          placeholder="Tell us about your practice, specialties, and unique value propositions."
        />
      </div>
      
      <div>
        <Label htmlFor="contactEmail">Contact Email *</Label>
        <Input 
          id="contactEmail" 
          name="contactEmail" 
          type="email"
          value={actualData?.contactEmail || ''} 
          onChange={handleChange}
          required 
        />
      </div>
      
      <div>
        <Label htmlFor="contactPhone">Contact Phone *</Label>
        <Input 
          id="contactPhone" 
          name="contactPhone" 
          value={actualData?.contactPhone || ''} 
          onChange={handleChange}
          required 
        />
      </div>
      
      {handleNext && (
        <TabNavigation showPrevious={false} onNext={handleNext} />
      )}
    </>
  );
};

export default PracticeInfoTab;
