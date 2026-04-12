
import React from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import TabNavigation from "../TabNavigation";
import FormSection from "../FormSection";

interface AdditionalTabProps {
  formData?: any;
  data?: any;
  handleInputChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onChange?: (field: string, value: any) => void;
  handlePrevious?: () => void;
  isSubmitting?: boolean;
}

const AdditionalTab: React.FC<AdditionalTabProps> = ({ 
  formData,
  data,
  handleInputChange,
  onChange,
  handlePrevious,
  isSubmitting
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
        <Label htmlFor="additionalNotes">Additional Information or Requirements</Label>
        <Textarea 
          id="additionalNotes" 
          name="additionalNotes" 
          value={actualData?.additionalNotes || ''} 
          onChange={handleChange}
          rows={6}
          placeholder="Any additional details, preferences, or requirements for your platform."
        />
      </div>
      
      <div className="pt-6 space-y-4">
        <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <h3 className="font-semibold text-amber-800">What happens next?</h3>
          <p className="text-amber-700 text-sm mt-1">
            Once you submit this form, our team will begin building your platform immediately.
            We'll contact you via email if we need any additional information.
          </p>
        </div>
        
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={handlePrevious}>
            Previous
          </Button>
          <Button 
            type="submit" 
            className="bg-conve-red hover:bg-conve-red/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Submitting..." : "Complete Platform Setup"}
          </Button>
        </div>
      </div>
    </>
  );
};

export default AdditionalTab;
