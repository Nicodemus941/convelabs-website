
import React from 'react';
import { Button } from '@/components/ui/button';

interface NavigationButtonsProps {
  activeStep: string;
  isConciergeDoctor: boolean;
  handleNextStep: () => void;
}

const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  activeStep,
  isConciergeDoctor,
  handleNextStep
}) => {
  // Determine next step label
  const getNextStepLabel = () => {
    if (activeStep === 'security') return 'Continue to Personal Details';
    if (activeStep === 'details') return isConciergeDoctor ? 'Continue to Practice Setup' : 'Continue to Booking';
    if (activeStep === 'booking' || (isConciergeDoctor && activeStep === 'concierge')) return 'Complete & Go to Dashboard';
    return 'Continue';
  };
  
  return (
    <div className="mt-8 flex justify-end">
      <Button size="lg" onClick={handleNextStep}>
        {getNextStepLabel()}
      </Button>
    </div>
  );
};

export default NavigationButtons;
