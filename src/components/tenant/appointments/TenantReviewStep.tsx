
import React from 'react';
import { Tenant } from '@/types/tenant';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import { format } from 'date-fns';

interface TenantReviewStepProps {
  tenant: Tenant;
  onPrevious: () => void;  // Renamed from onBack to onPrevious for consistency
  onComplete?: () => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  form?: UseFormReturn<any>;
}

const TenantReviewStep: React.FC<TenantReviewStepProps> = ({ 
  tenant, 
  onPrevious, 
  onComplete,
  onSubmit,
  isSubmitting = false,
  form
}) => {
  const [agreed, setAgreed] = React.useState(false);
  
  const handleAgreementChange = (checked: boolean) => {
    setAgreed(checked);
    // If form is provided, update the form values
    if (form) {
      form.setValue('termsAccepted', checked);
    }
  };
  
  const handleSubmit = async () => {
    if (onSubmit) {
      onSubmit();
    } else if (onComplete) {
      try {
        // In a real implementation, this would submit the appointment to the API
        await new Promise(resolve => setTimeout(resolve, 1500));
        onComplete();
      } catch (error) {
        console.error("Error submitting appointment:", error);
      }
    }
  };
  
  // Get form data if available
  const formData = form?.getValues();
  const selectedDate = formData?.date ? new Date(formData.date) : new Date();
  const formattedDate = selectedDate ? format(selectedDate, 'MMM d, yyyy') : 'Not selected';
  const selectedTime = formData?.time || 'Not selected';
  const selectedService = formData?.serviceDetails?.selectedService === 'service-1' ? 'Basic Check-up' :
                          formData?.serviceDetails?.selectedService === 'service-2' ? 'Comprehensive Evaluation' :
                          formData?.serviceDetails?.selectedService === 'service-3' ? 'Specialized Consultation' : 'Not selected';
  
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <h3 className="font-medium text-lg mb-4">Appointment Summary</h3>
          
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service:</span>
              <span className="font-medium">{selectedService}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium">{formattedDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time:</span>
              <span className="font-medium">{selectedTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Provider:</span>
              <span className="font-medium">{tenant.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium">$99.00</span>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="flex items-center space-x-2">
        <Checkbox id="terms" checked={agreed} onCheckedChange={(checked) => handleAgreementChange(checked as boolean)} />
        <Label htmlFor="terms">
          I agree to the terms and conditions and confirm this appointment
        </Label>
      </div>
      
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrevious} disabled={isSubmitting}>
          Back
        </Button>
        <Button onClick={handleSubmit} disabled={!agreed || isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Confirming...
            </>
          ) : (
            'Confirm Appointment'
          )}
        </Button>
      </div>
    </div>
  );
};

export default TenantReviewStep;
