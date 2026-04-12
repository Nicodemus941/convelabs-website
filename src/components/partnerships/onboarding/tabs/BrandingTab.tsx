
import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import TabNavigation from "../TabNavigation";
import FormSection from "../FormSection";

interface BrandingTabProps {
  formData?: any;
  data?: any;
  handleInputChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onChange?: (field: string, value: any) => void;
  handleLogoChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  logoPreview?: string | null;
  handlePrevious?: () => void;
  handleNext?: () => void;
}

const BrandingTab: React.FC<BrandingTabProps> = ({ 
  formData,
  data,
  handleInputChange,
  onChange,
  handleLogoChange,
  logoPreview,
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
  
  return (
    <>
      <div>
        <Label htmlFor="primaryColor">Primary Brand Color *</Label>
        <div className="flex items-center gap-4">
          <Input 
            id="primaryColor" 
            name="primaryColor" 
            type="color"
            value={actualData?.primaryColor || '#FF0000'} 
            onChange={handleChange}
            required 
            className="w-20 h-10"
          />
          <span className="text-sm text-gray-500">{actualData?.primaryColor || '#FF0000'}</span>
        </div>
      </div>
      
      <div>
        <Label htmlFor="secondaryColor">Secondary Brand Color *</Label>
        <div className="flex items-center gap-4">
          <Input 
            id="secondaryColor" 
            name="secondaryColor" 
            type="color"
            value={actualData?.secondaryColor || '#333333'} 
            onChange={handleChange}
            required 
            className="w-20 h-10"
          />
          <span className="text-sm text-gray-500">{actualData?.secondaryColor || '#333333'}</span>
        </div>
      </div>
      
      <div>
        <Label htmlFor="logo">Practice Logo</Label>
        <Input 
          id="logo" 
          name="logo" 
          type="file"
          accept="image/*"
          onChange={handleLogoChange} 
          className="mt-1"
        />
        {logoPreview && (
          <div className="mt-4">
            <p className="text-sm mb-2">Logo Preview:</p>
            <img 
              src={logoPreview} 
              alt="Logo preview" 
              className="max-w-[200px] max-h-[100px] border border-gray-200 rounded"
            />
          </div>
        )}
      </div>
      
      {(handleNext && handlePrevious) && (
        <TabNavigation onPrevious={handlePrevious} onNext={handleNext} />
      )}
    </>
  );
};

export default BrandingTab;
